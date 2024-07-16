const logger = require('./Config/logger.js')
const { parseMessage } = require('./Messages')
const { userValidation } = require('./Validation/index.js')

// [userId: websocket]
const connectedUsers = {}

// [conversationId: userId[]]
const activeConversations = {}

const verifyUser = ({ token }) => {
  if (!token) {
    throw { closeConnection: true, message: 'token required to verify user' }
  }

  return userValidation({ token }).catch((error) => {
    throw { closeConnection: true, message: `Invalid token ${error}` }
  })
}

const onConnection = (ws) => {
  ws.on('message', async (message) => {
    let currentUserId = null
    let jsonMessage = null

    try {
      jsonMessage = JSON.parse(message)
    } catch (error) {
      logger.error(error)

      ws.send(
        'Message is not a JSON object. Please format your request as JSON.'
      )
      return
    }

    try {
      const result = await verifyUser({ token: jsonMessage.token })

      currentUserId = result.idFromToken
    } catch (error) {
      if (error?.message.includes('Invalid token')) {
        const authTokenMsg =
          'The auth token provided on login is required in all messages'

        logger.error(authTokenMsg)
        return ws.send(authTokenMsg)
      }
    }

    const localLogger = logger.child({ meta: { userId: currentUserId } })

    localLogger.info(`Message received: ${jsonMessage.type}`)

    const data = await parseMessage({
      message: jsonMessage,
      currentUserId: userId,
      logger: localLogger
    })

    localLogger.info(JSON.stringify({ result: Object.keys(data) }))

    switch (jsonMessage.type) {
      case 'verifyUser':
        // connect the user to the websocket and send a connected message
        const userObject = { ws }

        if (jsonMessage.deviceToken) {
          // save the device token
          userObject.deviceToken = jsonMessage.deviceToken
        }

        connectedUsers[currentUserId] = userObject

        ws.send(JSON.stringify(data))
        break
      case 'sendMessage':
        // send the message out to everyone in the conversation after it's been saved to the database
        // include in the message the new conversation object
        if (activeConversations[data.message.conversation_id]) {
          localLogger.info(`Message from user: ${currentUserId}`)

          activeConversations[result.message.conversation_id].forEach(
            (userId) => {
              if (connectedUsers[userId]) {
                connectedUsers[userId].websocket.send(JSON.stringify(data))
              }

              localLogger.info(
                `Sent message to user ${userId} in conversation ${result.message.conversation_id}`
              )
            }
          )
        } else {
          activeConversations[data.message.conversation_id] = [currentUserId]
          connectedUsers[currentUserId].websocket.send(JSON.stringify(data))
        }
        break
      case 'createNewConversation':
        // a new conversation was added
        // send the new conversation to every connected user in the conversation
        // and add the conversation to the active conversations
        if (data.conversation_exists === false) {
          const newConversation = data.conversations[0]
          activeConversations[newConversation.conversation_id] =
            newConversation.users.map(({ user_id }) => user_id)

          newConversation.users.forEach(({ user_id }) => {
            if (connectedUsers?.[user_id]) {
              connectedUsers[user_id].websocket.send(JSON.stringify(data))
            }
          })
        } else {
          connectedUsers[currentUserId].websocket.send(JSON.stringify(data))
        }
        break
      case 'getConversation':
        // responding to a request for all the messages for a particular conversation
        connectedUsers[currentUserId].websocket.send(JSON.stringify(data))
        break
      case 'getAllConversations':
        // subscribe the user to each conversation once they are connected
        const userConversationKeys = Object.keys(data.conversations)

        userConversationKeys.forEach((conversationKey) => {
          if (activeConversations[conversationKey]) {
            activeConversations[conversationKey].push(currentUserId)
            const tempConversation = new Set(
              activeConversations[conversationKey]
            )
            activeConversations[conversationKey] = [...tempConversation]
          } else {
            activeConversations[conversationKey] = [currentUserId]
          }
        })

        connectedUsers[currentUserId].send(JSON.stringify(data))
        break
      case 'addUserToConversation':
        // add the user to the list of recepients from that conversation
        activeConversations[data.conversation_id].push(data.user_id)
        activeConversations[data.conversation_id].forEach((userId) => {
          if (connectedUsers[userId]) {
            connectedUsers[userId].websocket.send(JSON.stringify(data))
          }
        })
        break
      default:
        if (data.error) {
          localLogger.error(data.error.message ?? data.error)
        }

        ws.send(JSON.stringify(data))
    }
  })

  ws.on('close', (code, reason) => {
    logger.info(`Connection closed: ${code} ${reason}`)
    delete connectedUsers[currentUserId]
  })
}

module.exports = {
  onConnection
}
