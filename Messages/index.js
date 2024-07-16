const serviceHandler = require('../Config/services.js')

/**
 * @description parseMessage takes a parsed JSON object and sorts what type of message it is
 * it then acts on the specific message type
 * @param {Object} message
 */
const parseMessage = async ({ message, userId, logger }) => {
  let response = null

  switch (message.type) {
    case 'getAllConversations':
      response = await getUserConversations({ userId, logger })
      break
    case 'getConversation':
      response = await getConversation({
        conversationId: message.conversationId,
        userId,
        logger
      })
      break
    case 'verifyUser':
      if (message.deviceToken) {
        // save the device token if one is provided
        // if the token is already in the database it'll ignore it
        logger.info('couloirs: saving device token')

        const successMessage =
          await serviceHandler.messagingService.saveDeviceToken({
            userId,
            token: message.deviceToken
          })
        logger.info(
          JSON.stringify({ deviceTokenSuccessMessage: successMessage })
        )
      }

      response = await Promise.resolve({ userJoined: true })
      break
    case 'sendMessage':
      response = await sendMessage({
        conversationId: message.conversationId,
        messageBody: message.messageBody,
        userId,
        senderName: message.senderName,
        logger
      })
      break
    case 'createNewConversation':
      logger.info(JSON.stringify({ userIds: [...message.userIds, userId] }))
      if (
        !message.userIds?.length ||
        message.userIds.includes(null) ||
        message.userIds.includes(undefined)
      ) {
        response = await Promise.resolve({
          error:
            'At least two users including the logged in user need to be added to a conversation'
        })
        break
      }
      response = await createNewConversation({
        userIds: [...message.userIds, userId],
        logger
      })
      break
    case 'addUserToConversation':
      if (!message.userId || !message.conversationId) {
        logger.error(
          JSON.stringify({
            message:
              'a userId and a conversationId need to be specified to add the user to the conversation'
          })
        )

        response = await Promise.resolve({
          error:
            'a userId and a conversationId need to be specified to add the user to the conversation'
        })
        break
      }

      response = await addNewUserToConversation({
        userId: message.userId,
        conversationId: message.conversationId,
        logger
      })
      break
    default:
      response = await Promise.resolve({ error: 'no message type provided' })
      break
  }
  return { ...response, request: message.type }
}

const getConversation = async ({ conversationId, userId, logger }) => {
  try {
    const messages = await serviceHandler.messagingService.getConversation({
      conversationId,
      userId
    })
    return { messages }
  } catch (error) {
    logger.error(error)
    return Promise.resolve({
      error: `No conversation found for id ${conversationId}`
    })
  }
}

const getUserConversations = async ({ userId, logger }) => {
  try {
    const conversations =
      await serviceHandler.messagingService.getConversationsPerUser({ userId })
    return { conversations }
  } catch (error) {
    logger.error(error)
    return Promise.resolve({
      error: `Conversations not found for user ${userId}`
    })
  }
}

const addNewUserToConversation = async ({ userId, conversationId, logger }) => {
  try {
    logger.info(`Adding new user to conversation ${conversationId}`)
    await serviceHandler.messagingService.expandConversation({
      userId,
      conversationId
    })

    logger.info(
      JSON.stringify({
        newUserToConversation: true,
        userId,
        conversationId
      })
    )

    return {
      user_added: true,
      user_id: userId,
      conversation_id: conversationId
    }
  } catch (error) {
    logger.error(error)
    return { userAdded: false, error: { message: error.message ?? error } }
  }
}

const createNewConversation = async ({ userIds, logger }) => {
  try {
    const { conversation_exists, conversations } =
      await serviceHandler.messagingService.createConversation({
        userIds
      })

    logger.info(JSON.stringify({ conversation_exists, conversations }))

    return { conversations, conversation_exists }
  } catch (error) {
    logger.eror(error)
    return Promise.resolve({ error: 'could not create a new conversation' })
  }
}

const sendMessage = async ({
  userId: senderId,
  conversationId,
  messageBody,
  senderName,
  logger
}) => {
  try {
    logger.info(
      JSON.stringify({ receivedMessage: { conversationId, senderId } })
    )

    const message = {
      ...(await serviceHandler.messagingService.sendMessage({
        conversationId,
        senderId,
        senderName,
        messageBody
      })),
      sender_name: senderName
    }

    return { message }
  } catch (error) {
    logger.error(error)
    return Promise.resolve({ error: 'Could not send message' })
  }
}

module.exports = {
  parseMessage
}
