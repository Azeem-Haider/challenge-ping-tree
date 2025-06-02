// utils/http-error.js
function throwError (message, statusCode = 500) {
  const error = new Error(message)
  error.statusCode = statusCode
  throw error
}

module.exports = { throwError }
