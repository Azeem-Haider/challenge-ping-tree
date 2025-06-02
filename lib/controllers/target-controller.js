const sendJson = require('send-data/json')
const targetService = require('../services/target-service')
const { parseBody } = require('../utils/request-parser')
const { throwError } = require('../utils/http-error')

const isNumeric = (val) => {
  const num = Number.parseFloat(val)
  return !isNaN(num) && isFinite(num) && num >= 0
}

const isInteger = (val) => {
  const num = Number.parseFloat(val)
  return Number.isInteger(num) && !isNaN(num) && num >= 0
}

// Create a new target
const createTarget = async (req, res) => {
  const body = await parseBody(req)
  const { url, value, maxAcceptsPerDay } = body

  if (!url || !value || !maxAcceptsPerDay) {
    throwError('Missing required fields: url, value, and maxAcceptsPerDay', 400)
  }

  if (!isNumeric(value)) {
    throwError('Field "value" must be a non-negative number', 400)
  }

  if (!isInteger(maxAcceptsPerDay)) {
    throwError('Field "maxAcceptsPerDay" must be a non-negative integer', 400)
  }

  const target = await targetService.createTarget(body)
  sendJson(req, res, target)
}

// Get all targets
const getAllTargets = async (req, res) => {
  const targets = await targetService.getAllTargets()
  sendJson(req, res, targets)
}

// Get a target by ID
const getTargetById = async (req, res, opts) => {
  const { id } = opts.params
  if (!id) throwError('Target ID is required', 400)

  const target = await targetService.getTargetById(id)
  if (!target) throwError('Target not found', 404)

  sendJson(req, res, target)
}

// Update a target by ID
const updateTarget = async (req, res, opts) => {
  const { id } = opts.params
  if (!id) throwError('Target ID is required', 400)

  const updateData = await parseBody(req)
  const { value, maxAcceptsPerDay } = updateData

  if (value !== undefined && !isNumeric(value)) {
    throwError('Field "value" must be a non-negative number', 400)
  }

  if (maxAcceptsPerDay !== undefined && !isInteger(maxAcceptsPerDay)) {
    throwError('Field "maxAcceptsPerDay" must be a non-negative integer', 400)
  }

  const target = await targetService.updateTarget(id, updateData)
  if (!target) throwError('Target not found', 404)

  sendJson(req, res, target)
}

module.exports = {
  createTarget,
  getAllTargets,
  getTargetById,
  updateTarget
}
