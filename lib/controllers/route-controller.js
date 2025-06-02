const sendJson = require('send-data/json')
const routeService = require('../services/route-service')
const { parseBody } = require('../utils/request-parser')
const { throwError } = require('../utils/http-error')

const isValidTimestamp = (str) => {
  const date = new Date(str)
  return !isNaN(date.getTime())
}

const routeVisitor = async (req, res) => {
  const visitorData = await parseBody(req)
  const { geoState, timestamp } = visitorData

  if (!geoState || !timestamp) {
    throwError('Missing required fields: geoState and timestamp', 400)
  }

  if (!isValidTimestamp(timestamp)) {
    throwError('Invalid timestamp format. Must be a valid date string.', 400)
  }

  const decision = await routeService.routeVisitor(visitorData)
  sendJson(req, res, decision)
}

module.exports = {
  routeVisitor
}
