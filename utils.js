const jwt = require('jsonwebtoken')
const fs = require('fs')

let generatedDate = null
let currentToken = null

const generateJWTForAPNS = () => {
  const privateKey = fs.readFileSync(process.env.PATH_TO_APNS_SECRET_KEY)

  const thirtyMinutes = 1000 * 60 * 30

  if (generatedDate === null || Date.now() - thirtyMinutes > generatedDate) {
    generatedDate = Date.now()

    currentToken = jwt.sign(
      { iss: 'JL5XC754Z2', iat: Math.floor(generatedDate / 1000) },
      privateKey,
      { header: { alg: 'ES256', kid: process.env.APNS_KEY_ID } }
    )
  }

  return currentToken
}

const makeAPNSRequest = (senderName, messageBody) => {
  const bearerToken = generateJWTForAPNS()

  return axios
    .post(
      `https://${process.env.APNS_CONNECTION_URI}/3/device/${user.deviceToken}`,
      {
        aps: {
          alert: {
            title: senderName,
            body: messageBody
          }
        }
      },
      {
        authorization: `bearer ${bearerToken}`
      }
    )
    .then((response) => {
      logger.info(JSON.stringify(response))
    })
}

module.exports = {
  makeAPNSRequest
}
