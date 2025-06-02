const redis = require('../redis')
const { promisify } = require('util')
const cuid = require('cuid')

// Promisify Redis commands
const saddAsync = promisify(redis.sadd).bind(redis)
const setAsync = promisify(redis.set).bind(redis)
const smembersAsync = promisify(redis.smembers).bind(redis)
const getAsync = promisify(redis.get).bind(redis)

// Constants
const TARGET_SET_KEY = 'targets'
const getTargetKey = (id) => `target:${id}`

// Create a new target
const createTarget = async (targetData) => {
  const id = targetData.id || cuid()

  const target = {
    id,
    url: targetData.url,
    value: targetData.value,
    maxAcceptsPerDay: targetData.maxAcceptsPerDay,
    accept: targetData.accept || {}
  }

  await Promise.all([
    saddAsync(TARGET_SET_KEY, id),
    setAsync(getTargetKey(id), JSON.stringify(target))
  ])

  return target
}

// Get all targets
const getAllTargets = async () => {
  const ids = await smembersAsync(TARGET_SET_KEY)
  if (!ids.length) return []

  const targets = await Promise.all(
    ids.map(async (id) => {
      const data = await getAsync(getTargetKey(id))
      return data ? JSON.parse(data) : null
    })
  )

  return targets.filter(Boolean)
}

// Get a target by ID
const getTargetById = async (id) => {
  const data = await getAsync(getTargetKey(id))
  return data ? JSON.parse(data) : null
}

// Update an existing target
const updateTarget = async (id, updates) => {
  const existing = await getTargetById(id)
  if (!existing) return null

  const updated = {
    ...existing,
    ...updates,
    id,
    value: updates.value !== undefined ? updates.value : existing.value,
    maxAcceptsPerDay: updates.maxAcceptsPerDay !== undefined
      ? updates.maxAcceptsPerDay
      : existing.maxAcceptsPerDay
  }

  await setAsync(getTargetKey(id), JSON.stringify(updated))
  return updated
}

module.exports = {
  createTarget,
  getAllTargets,
  getTargetById,
  updateTarget
}
