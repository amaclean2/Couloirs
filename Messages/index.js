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
      return Promise.resolve({ userJoined: true })
    case 'sendMessage':
      return sendMessage({
        conversationId: message.conversationId,
        messageBody: message.messageBody,
        userId,
        senderName: message.senderName
      })
    case 'createNewConversation':
      if (!message.userIds || !message.userIds.length) {
        throw {
          message: 'at least two users need to be added to a conversation'
        }
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
        throw {
          message:
            'a userId and a conversationId need to be specified to add the user to the conversation'
        }
      }

      addNewUserToConversation({
        userId: message.userId,
        conversationId: message.conversationId
      })
    default:
      return Promise.reject('no message type provided')
  }
}

const getConversation = ({ conversationId, userId }) => {
  return serviceHandler.messagingService
    .getConversation({
      conversationId,
      userId
    })
    .then((messages) => ({ messages }))
}

const getUserConversations = ({ userId }) => {
  return serviceHandler.messagingService
    .getConversationsPerUser({ userId })
    .then((conversations) => ({ conversations }))
}

const addNewUserToConversation = ({ userId, conversationId }) => {
  try {
    logger.info({
      newUserToConversation: true,
      userId,
      conversationId
    })

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
  } catch (error) {
    return { userAdded: false, error: { message: error.message ?? error } }
  }
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
}

const sendMessage = ({ userId, conversationId, messageBody, senderName }) => {
  logger.info(JSON.stringify({ receivedMessage: { conversationId, userId } }))

  return serviceHandler.messagingService
    .sendMessage({
      conversationId,
      senderId: userId,
      messageBody
    })
    .then((message) => ({ message: { ...message, sender_name: senderName } }))
}

module.exports = {
  parseMessage
}
