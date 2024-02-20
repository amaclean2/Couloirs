const apn = require('apn')

const createAPNProvider = () => {
  const options = {
    token: {
      key: process.env.PATH_TO_APNS_SECRET_KEY,
      keyId: process.env.APNS_KEY_ID,
      teamId: 'JL5XC754Z2'
    },
    production: true
  }

  return new apn.Provider(options)
}

const apnProvider = createAPNProvider()

const createAPNNotification = (
  senderName,
  messageBody,
  deviceTokens,
  logger
) => {
  const note = new apn.Notification()

  note.expiry = 0
  note.alert = {
    title: senderName,
    body: messageBody
  }
  note.topic = 'com.sundaypeak.SundayPeak'

  apnProvider.send(note, deviceTokens).then((result) => {
    if (result.failed.length) {
      logger.info(JSON.stringify({ result: result.failed }))
    } else {
      logger.info(JSON.stringify({ result: result.sent }))
    }
  })
}

module.exports = {
  createAPNNotification
}
