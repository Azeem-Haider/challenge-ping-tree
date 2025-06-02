const targetService = require('./target-service')
const redis = require('../redis')
const { promisify } = require('util')

const getAsync = promisify(redis.get).bind(redis)
const incrAsync = promisify(redis.incr).bind(redis)
const expireAsync = promisify(redis.expire).bind(redis)

const EXPIRE_SECONDS = 86400 // 24 hours

const getAcceptsKey = (targetId, date) => `target:${targetId}:accepts:${date}`

// Gets daily accepts for a target
const getDailyAccepts = async (targetId, date) => {
  const count = await getAsync(getAcceptsKey(targetId, date))
  return count ? parseInt(count, 10) : 0
}

// Increments daily accepts with expiration
const incrementDailyAccepts = async (targetId, date) => {
  const key = getAcceptsKey(targetId, date)
  await incrAsync(key)
  await expireAsync(key, EXPIRE_SECONDS)
}

// Checks if visitor matches target acceptance rules
const isTargetEligible = (target, geoState, visitHour) => {
  const { accept = {} } = target

  // Normalize geoState to lowercase for case-insensitive comparison
  const geoCheck =
    !accept.geoState?.$in ||
    accept.geoState.$in.some(
      (state) => state.toLowerCase() === geoState.toLowerCase()
    )

  const hourCheck = !accept.hour?.$in || accept.hour.$in.includes(visitHour)

  return geoCheck && hourCheck
}

// Filters eligible targets based on visitor and daily limits
const filterEligibleTargets = async (targets, geoState, visitHour, dateKey) => {
  const eligible = []
  for (const target of targets) {
    if (!isTargetEligible(target, geoState, visitHour)) continue

    const accepts = await getDailyAccepts(target.id, dateKey)
    if (accepts < parseInt(target.maxAcceptsPerDay, 10)) {
      eligible.push(target)
    }
  }
  return eligible
}

/**
 * Selects the target with the highest value.
 *
 * Current Strategy:
 * - Picks the first target with the highest `value` using Array.reduce().
 * - If multiple targets share the highest value, the first one is selected (order-biased).
 *
 * Alternative strategies (not implemented but possible):
 *
 * 1. **Random Selection Among Equals**
 *    Select randomly from all targets with the highest value to avoid bias.
 *
 * 2. **Selection by Remaining Daily Capacity**
 *    Prefer targets with the most remaining quota: (maxAcceptsPerDay - current usage).
 *
 * 3. **First in List**
 *    (Current behavior) Always picks the first eligible target with the highest value.
**/
const selectBestTarget = (targets) =>
  targets.reduce((best, current) =>
    parseFloat(current.value) > parseFloat(best.value) ? current : best
  )

// Main decision function
const routeVisitor = async ({ geoState, timestamp }) => {
  const visitDate = new Date(timestamp)
  const visitHour = visitDate.getUTCHours().toString()
  console.log(`Routing visitor from ${geoState} at ${visitHour} on ${visitDate.toISOString()}`)
  const dateKey = visitDate.toISOString().split('T')[0]

  const targets = await targetService.getAllTargets()
  if (!targets.length) return { decision: 'reject' }

  const eligibleTargets = await filterEligibleTargets(
    targets,
    geoState,
    visitHour,
    dateKey
  )
  if (!eligibleTargets.length) return { decision: 'reject' }

  const bestTarget = selectBestTarget(eligibleTargets)
  await incrementDailyAccepts(bestTarget.id, dateKey)

  return {
    decision: 'accept',
    target: {
      id: bestTarget.id,
      url: bestTarget.url,
      value: bestTarget.value
    }
  }
}

module.exports = { routeVisitor }
