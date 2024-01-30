const logger = require('../Config/logger.js')
const serviceHandler = require('../Config/services.js')

/**
 * @param {Object} message
 */
const parseMessage = ({ message, userId }) => {
  switch (message.type) {
    case 'getAllConversations':
      return getUserConversations({ userId })
    case 'getConversation':
      return getConversation({ conversationId: message.conversationId, userId })
    case 'verifyUser':
      if (message.deviceToken) {
        // save the device token if one is provided
        // if the token is already in the database it'll ignore it
        logger.info('couloirs: saving device token')

        return serviceHandler.messagingService.saveDeviceToken({
          userId,
          token: message.deviceToken
        })
      }

      return Promise.resolve({ userJoined: true })
    case 'sendMessage':
      return sendMessage({
        conversationId: message.conversationId,
        messageBody: message.messageBody,
        userId,
        senderName: message.senderName
      })
    case 'createNewConversation':
      console.log(message.userIds, userId)
      if (
        !message.userIds ||
        !message.userIds.length ||
        message.userIds.includes(null)
      ) {
        return Promise.resolve({
          error: 'at least two users need to be added to a conversation'
        })
      }
      logger.info(
        JSON.stringify({
          newConversation: true,
          userIds: [...message.userIds, userId]
        })
      )
      return createNewConversation({
        userIds: [...message.userIds, userId],
        senderId: userId
      })
    case 'addUserToConversation':
      if (!message.userId || !message.conversationId) {
        logger.error(
          JSON.stringify({
            message:
              'a userId and a conversationId need to be specified to add the user to the conversation'
          })
        )

        return Promise.resolve({
          error:
            'a userId and a conversationId need to be specified to add the user to the conversation'
        })
      }

      return addNewUserToConversation({
        userId: message.userId,
        conversationId: message.conversationId
      })
    default:
      return Promise.resolve({ error: 'no message type provided' })
  }
}

const getConversation = ({ conversationId, userId }) => {
  logger.info(`Getting conversation ${conversationId}`)
  return serviceHandler.messagingService
    .getConversation({
      conversationId,
      userId
    })
    .then((messages) => ({ messages }))
    .catch((error) => {
      logger.error(error)
      return Promise.resolve({
        error: `No conversation found for id ${conversationId}`
      })
    })
}

const getUserConversations = ({ userId }) => {
  logger.info(`Getting conversations for user ${userId}`)
  return serviceHandler.messagingService
    .getConversationsPerUser({ userId })
    .then((conversations) => ({ conversations }))
    .catch((error) => {
      logger.error(error)
      return Promise.resolve({
        error: `Conversations not found for user ${userId}`
      })
    })
}

const addNewUserToConversation = ({ userId, conversationId }) => {
  logger.info(
    JSON.stringify({
      newUserToConversation: true,
      userId,
      conversationId
    })
  )

  return serviceHandler.messagingService
    .expandConversation({
      userId,
      conversationId
    })
    .then(() => ({
      useAdded: true,
      userId,
      conversationId
    }))
    .catch((error) => {
      logger.error(error)
      return { userAdded: false, error: { message: error.message ?? error } }
    })
}

const createNewConversation = ({ userIds, senderId }) => {
  return serviceHandler.messagingService
    .createConversation({ userIds })
    .then((resp) => {
      if (resp.conversation_exists) {
        return {
          conversation: {
            users: userIds.map((id) => ({
              user_id: id
            })),
            ...resp.conversation
          }
        }
      }

      return {
        conversation: {
          users: userIds.map((id) => ({
            user_id: id
          })),
          conversation_id: resp.conversation_id,
          last_message: '',
          unread: false
        },
        senderId
      }
    })
    .catch((error) => {
      logger.error(error)
      return Promise.resolve({ error: 'could not create a new conversation' })
    })
}

const sendMessage = async ({
  userId,
  conversationId,
  messageBody,
  senderName
}) => {
  try {
    logger.info(JSON.stringify({ receivedMessage: { conversationId, userId } }))

    const message = await serviceHandler.messagingService.sendMessage({
      conversationId,
      senderId: userId,
      messageBody
    })

    const deviceTokens = message.applied_tokens

    if (deviceTokens.length) {
      logger.info('Sending notifications to connected device tokens')
      createAPNNotificaiton(senderName, messageBody, deviceTokens)
    }

    return {
      ...message,
      sender_name: senderName
    }
  } catch (error) {
    logger.error(error)
    return Promise.resolve({ error: 'Could not send message' })
  }
}

module.exports = {
  parseMessage
}
