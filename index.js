const logger = require('./Config/logger.js')
const { parseMessage } = require('./Messages')
const { userValidation } = require('./Validation/index.js')
const { makeAPNSRequest } = require('./utils.js')

const connectedUsers = {}
const activeConversations = {}

let websocket = null

const verifyUser = ({ token }) => {
  if (!token) {
    throw { closeConnection: true, message: 'token required to verify user' }
  }

  return userValidation({ token }).catch((error) => {
    throw { closeConnection: true, message: `Invalid token ${error}` }
  })
}

const onMessage = async (message) => {
  let userId
  let jsonMessage
  try {
    jsonMessage = JSON.parse(message)

    const result = await verifyUser({
      token: jsonMessage.token
    })
    userId = result.idFromToken
  } catch (error) {
    if (error?.message.includes('Invalid token')) {
      logger.error('A user auth token is required in all messages')
      return websocket.send(
        'The auth token provided on login is required in all messages.'
      )
    }

    logger.error(error)
    websocket.send(
      'Message is not a JSON object. Please format your request as JSON.'
    )
    return
  }

  parseMessage({ message: jsonMessage, userId }).then((result) => {
    logger.info({ result })
    if (result?.userJoined) {
      // connect the user to the websocket and send a connected message

      const userObject = {
        websocket
      }

      if (jsonMessage.deviceToken)
        userObject.deviceToken = jsonMessage.deviceToken

      connectedUsers[userId] = userObject

      websocket.send(
        JSON.stringify({
          connected: true,
          message: `user ${userId} connected`
        })
      )
    } else if (result.message) {
      // send the message out to everyone in the conversation after it's been saved to the database
      // include in the message the new conversation object
      if (activeConversations[result.message.conversation_id]) {
        logger.info(`Message from user: ${userId}`)

        activeConversations[result.message.conversation_id].forEach((user) => {
          connectedUsers[user].websocket.send(JSON.stringify(result))
          logger.info(
            `Sent message to user ${user} in conversation ${result.message.conversation_id}`
          )

          if (user.deviceToken) {
            makeAPNSRequest(
              result.message.sender_name,
              result.message.message_body
            )
          }
        })
      } else {
        activeConversations[result.message.conversation_id] = [userId]
        connectedUsers[userId].websocket.send(JSON.stringify(result))
      }
    } else if (result.conversation) {
      // a new conversation was added
      // send the new conversation to every connected user in the conversation
      // and add the conversation to the active conversations
      activeConversations[result.conversation.conversation_id] = [userId]
      result.conversation.users.forEach((user) => {
        if (connectedUsers?.[user.user_id]) {
          connectedUsers[user.user_id].websocket.send(JSON.stringify(result))
        }
      })
    } else if (result.messages) {
      // responding to a request for all the messages for a particular conversation
      connectedUsers[userId].websocket.send(JSON.stringify(result))
    } else if (result.conversations) {
      // subscribe the user to each conversation once they are connected
      const userConversationKeys = Object.keys(result.conversations)

      userConversationKeys.forEach((conversationKey) => {
        if (activeConversations[conversationKey]) {
          activeConversations[conversationKey].push(userId)
          const tempConversation = new Set(activeConversations[conversationKey])
          activeConversations[conversationKey] = [...tempConversation]
        } else {
          activeConversations[conversationKey] = [userId]
        }
      })
      websocket.send(JSON.stringify(result))
    } else {
      // forward the handled response
      websocket.send(JSON.stringify(result))
    }
  })
}

const onClose = (code, reason) => {
  logger.info(`Connection closed: ${code} ${reason}`)
  // connectedUsers.delete(connectedUsers[userId])
}

const onConnection = (ws) => {
  websocket = ws
  ws.on('message', onMessage)
  ws.on('close', onClose)
}

module.exports = {
  onConnection
}
