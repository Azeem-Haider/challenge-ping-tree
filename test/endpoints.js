process.env.NODE_ENV = 'test'

const test = require('ava')
const servertest = require('servertest')
const { promisify } = require('util')
const redis = require('../lib/redis')

const server = require('../lib/server')
const flushdbAsync = promisify(redis.flushdb).bind(redis)

const clearRedis = async () => {
  try {
    await flushdbAsync()
  } catch (err) {
    console.error('Failed to clear Redis before test:', err)
    throw err
  }
}

test.beforeEach(async () => {
  await clearRedis()
})

const request = (method, url, body, options = {}) => {
  return new Promise((resolve, reject) => {
    const requestOptions = {
      method,
      encoding: 'json',
      ...options
    }

    if (body && !['DELETE', 'GET'].includes(method)) {
      requestOptions.headers = {
        'Content-Type': 'application/json',
        ...options.headers
      }
    }

    const stream = servertest(server(), url, requestOptions, (err, res) => {
      if (err) return reject(err)
      resolve(res)
    })

    // Only send body for non-GET/DELETE requests
    if (body && !['DELETE', 'GET'].includes(method)) {
      if (options.raw) {
        stream.end(body)
      } else {
        stream.end(JSON.stringify(body))
      }
    }
  })
}

test.serial.cb('healthcheck', function (t) {
  const url = '/health'
  servertest(server(), url, { encoding: 'json' }, function (err, res) {
    t.falsy(err, 'no error')

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(res.body.status, 'OK', 'status is ok')
    t.end()
  })
})

// ============================================================================
// TARGET CREATION TESTS (POST /api/targets)
// ============================================================================

test.serial('POST /api/targets - create target with all fields', async (t) => {
  const body = {
    url: 'https://example.com',
    value: '0.50',
    maxAcceptsPerDay: '10',
    accept: {
      geoState: { $in: ['ca', 'ny'] },
      hour: { $in: ['13', '14', '15'] }
    }
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.truthy(res.body.id, 'target created with id')
  t.is(res.body.url, body.url, 'target url matches')
  t.is(res.body.value, body.value, 'target value matches')
  t.is(
    res.body.maxAcceptsPerDay,
    body.maxAcceptsPerDay,
    'max accepts per day matches'
  )
  t.deepEqual(res.body.accept, body.accept, 'target accept criteria matches')
})

test.serial(
  'POST /api/targets - create target with minimal fields',
  async (t) => {
    const body = {
      url: 'https://minimal.com',
      value: '1.00',
      maxAcceptsPerDay: '5'
    }

    const res = await request('POST', '/api/targets', body)

    t.is(res.statusCode, 200, 'correct statusCode')
    t.truthy(res.body.id, 'target created with id')
    t.is(res.body.url, body.url, 'target url matches')
    t.deepEqual(
      res.body.accept,
      {},
      'accept criteria defaults to empty object'
    )
  }
)

test.serial('POST /api/targets - missing url field', async (t) => {
  const body = {
    value: '1.00',
    maxAcceptsPerDay: '5'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
  t.regex(
    res.body.error,
    /missing required fields/i,
    'appropriate error message'
  )
})

test.serial('POST /api/targets - missing value field', async (t) => {
  const body = {
    url: 'https://example.com',
    maxAcceptsPerDay: '5'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
})

test.serial('POST /api/targets - missing maxAcceptsPerDay field', async (t) => {
  const body = {
    url: 'https://example.com',
    value: '1.00'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
})

test.serial('POST /api/targets - valid value (integer)', async (t) => {
  const body = {
    url: 'https://example.com',
    value: '5',
    maxAcceptsPerDay: '10'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.value, '5', 'integer value accepted')
})

test.serial('POST /api/targets - valid value (decimal)', async (t) => {
  const body = {
    url: 'https://example.com',
    value: '1.2345',
    maxAcceptsPerDay: '10'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.value, '1.2345', 'decimal value accepted')
})

test.serial('POST /api/targets - valid value (zero)', async (t) => {
  const body = {
    url: 'https://example.com',
    value: '0',
    maxAcceptsPerDay: '10'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.value, '0', 'zero value accepted')
})

test.serial('POST /api/targets - invalid value (non-numeric)', async (t) => {
  const body = {
    url: 'https://example.com',
    value: 'invalid',
    maxAcceptsPerDay: '5'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.regex(res.body.error, /non-negative number/i, 'appropriate error message')
})

test.serial(
  'POST /api/targets - invalid value (negative number)',
  async (t) => {
    const body = {
      url: 'https://example.com',
      value: '-1.00',
      maxAcceptsPerDay: '5'
    }

    const res = await request('POST', '/api/targets', body)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative number/i,
      'appropriate error message'
    )
  }
)

test.serial(
  'POST /api/targets - valid maxAcceptsPerDay (positive integer)',
  async (t) => {
    const body = {
      url: 'https://example.com',
      value: '1.00',
      maxAcceptsPerDay: '10'
    }

    const res = await request('POST', '/api/targets', body)

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(
      res.body.maxAcceptsPerDay,
      '10',
      'positive integer maxAcceptsPerDay accepted'
    )
  }
)

test.serial('POST /api/targets - valid maxAcceptsPerDay (zero)', async (t) => {
  const body = {
    url: 'https://example.com',
    value: '1.00',
    maxAcceptsPerDay: '0'
  }

  const res = await request('POST', '/api/targets', body)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.maxAcceptsPerDay, '0', 'zero maxAcceptsPerDay accepted')
})

test.serial(
  'POST /api/targets - invalid maxAcceptsPerDay (decimal)',
  async (t) => {
    const body = {
      url: 'https://example.com',
      value: '1.00',
      maxAcceptsPerDay: '5.5'
    }

    const res = await request('POST', '/api/targets', body)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative integer/i,
      'appropriate error message'
    )
  }
)

test.serial(
  'POST /api/targets - invalid maxAcceptsPerDay (negative integer)',
  async (t) => {
    const body = {
      url: 'https://example.com',
      value: '1.00',
      maxAcceptsPerDay: '-5'
    }

    const res = await request('POST', '/api/targets', body)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative integer/i,
      'appropriate error message'
    )
  }
)

test.serial(
  'POST /api/targets - invalid maxAcceptsPerDay (non-numeric)',
  async (t) => {
    const body = {
      url: 'https://example.com',
      value: '1.00',
      maxAcceptsPerDay: 'invalid'
    }

    const res = await request('POST', '/api/targets', body)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative integer/i,
      'appropriate error message'
    )
  }
)

test.serial('POST /api/targets - invalid JSON body', async (t) => {
  const res = await request('POST', '/api/targets', 'invalid json', {
    raw: true
  })

  t.is(res.statusCode, 500, 'correct error statusCode')
})

// ============================================================================
// GET ALL TARGETS TESTS (GET /api/targets)
// ============================================================================

test.serial('GET /api/targets - empty database', async (t) => {
  const res = await request('GET', '/api/targets')

  t.is(res.statusCode, 200, 'correct statusCode')
  t.true(Array.isArray(res.body), 'response is an array')
  t.is(res.body.length, 0, 'empty array for no targets')
})

test.serial('GET /api/targets - multiple targets', async (t) => {
  // Create multiple targets
  const targets = [
    { url: 'https://first.com', value: '1.00', maxAcceptsPerDay: '10' },
    { url: 'https://second.com', value: '2.00', maxAcceptsPerDay: '20' },
    { url: 'https://third.com', value: '0.50', maxAcceptsPerDay: '5' }
  ]

  for (const target of targets) {
    await request('POST', '/api/targets', target)
  }

  const res = await request('GET', '/api/targets')

  t.is(res.statusCode, 200, 'correct statusCode')
  t.true(Array.isArray(res.body), 'response is an array')
  t.is(res.body.length, 3, 'correct number of targets')

  // Check that all URLs are present
  const urls = res.body.map((target) => target.url)
  targets.forEach((target) => {
    t.true(urls.includes(target.url), `target ${target.url} is present`)
  })
})

// ============================================================================
// GET TARGET BY ID TESTS (GET /api/target/:id)
// ============================================================================

test.serial('GET /api/target/:id - existing target', async (t) => {
  const createBody = {
    url: 'https://specific.com',
    value: '2.00',
    maxAcceptsPerDay: '15',
    accept: { geoState: { $in: ['ca'] } }
  }

  const createRes = await request('POST', '/api/targets', createBody)
  const targetId = createRes.body.id

  const res = await request('GET', `/api/target/${targetId}`)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.id, targetId, 'target ID matches')
  t.is(res.body.url, createBody.url, 'target url matches')
  t.is(res.body.value, createBody.value, 'target value matches')
  t.deepEqual(res.body.accept, createBody.accept, 'accept criteria matches')
})

test.serial('GET /api/target/:id - non-existent target', async (t) => {
  const res = await request('GET', '/api/target/nonexistent')

  t.is(res.statusCode, 404, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
  t.regex(res.body.error, /not found/i, 'appropriate error message')
})

test.serial('GET /api/target/:id - empty ID', async (t) => {
  const res = await request('GET', '/api/target/')

  t.is(res.statusCode, 404, 'route not found')
})

// ============================================================================
// UPDATE TARGET TESTS (POST /api/target/:id)
// ============================================================================

test.serial('POST /api/target/:id - update existing target', async (t) => {
  const createBody = {
    url: 'https://update.com',
    value: '1.50',
    maxAcceptsPerDay: '20'
  }

  const createRes = await request('POST', '/api/targets', createBody)
  const targetId = createRes.body.id

  const updateBody = {
    value: '3.00',
    maxAcceptsPerDay: '25'
  }

  const res = await request('POST', `/api/target/${targetId}`, updateBody)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.id, targetId, 'target ID matches')
  t.is(res.body.value, updateBody.value, 'target value updated')
  t.is(
    res.body.maxAcceptsPerDay,
    updateBody.maxAcceptsPerDay,
    'max accepts per day updated'
  )
  t.is(res.body.url, createBody.url, 'url unchanged')
})

test.serial('POST /api/target/:id - partial update', async (t) => {
  const createBody = {
    url: 'https://partial.com',
    value: '1.00',
    maxAcceptsPerDay: '10'
  }

  const createRes = await request('POST', '/api/targets', createBody)
  const targetId = createRes.body.id

  const updateBody = { value: '2.50' }

  const res = await request('POST', `/api/target/${targetId}`, updateBody)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.value, updateBody.value, 'target value updated')
  t.is(
    res.body.maxAcceptsPerDay,
    createBody.maxAcceptsPerDay,
    'max accepts per day unchanged'
  )
  t.is(res.body.url, createBody.url, 'url unchanged')
})

test.serial('POST /api/target/:id - update non-existent target', async (t) => {
  const updateBody = { value: '2.00' }

  const res = await request('POST', '/api/target/nonexistent', updateBody)

  t.is(res.statusCode, 404, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
})

test.serial('POST /api/target/:id - invalid value in update', async (t) => {
  const createBody = {
    url: 'https://invalid-update.com',
    value: '1.00',
    maxAcceptsPerDay: '10'
  }

  const createRes = await request('POST', '/api/targets', createBody)
  const targetId = createRes.body.id

  const updateBody = { value: 'invalid' }

  const res = await request('POST', `/api/target/${targetId}`, updateBody)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.regex(res.body.error, /non-negative number/i, 'appropriate error message')
})

test.serial('POST /api/target/:id - negative value in update', async (t) => {
  const createBody = {
    url: 'https://negative-update.com',
    value: '1.00',
    maxAcceptsPerDay: '10'
  }

  const createRes = await request('POST', '/api/targets', createBody)
  const targetId = createRes.body.id

  const updateBody = { value: '-0.50' }

  const res = await request('POST', `/api/target/${targetId}`, updateBody)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.regex(res.body.error, /non-negative number/i, 'appropriate error message')
})

test.serial(
  'POST /api/target/:id - invalid maxAcceptsPerDay in update',
  async (t) => {
    const createBody = {
      url: 'https://invalid-max-update.com',
      value: '1.00',
      maxAcceptsPerDay: '10'
    }

    const createRes = await request('POST', '/api/targets', createBody)
    const targetId = createRes.body.id

    const updateBody = { maxAcceptsPerDay: '5.5' } // Float instead of integer

    const res = await request('POST', `/api/target/${targetId}`, updateBody)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative integer/i,
      'appropriate error message'
    )
  }
)

test.serial(
  'POST /api/target/:id - negative maxAcceptsPerDay in update',
  async (t) => {
    const createBody = {
      url: 'https://negative-max-update.com',
      value: '1.00',
      maxAcceptsPerDay: '10'
    }

    const createRes = await request('POST', '/api/targets', createBody)
    const targetId = createRes.body.id

    const updateBody = { maxAcceptsPerDay: '-5' } // Negative integer

    const res = await request('POST', `/api/target/${targetId}`, updateBody)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative integer/i,
      'appropriate error message'
    )
  }
)

test.serial(
  'POST /api/target/:id - invalid maxAcceptsPerDay (non-numeric) in update',
  async (t) => {
    const createBody = {
      url: 'https://invalid-max-update-2.com',
      value: '1.00',
      maxAcceptsPerDay: '10'
    }

    const createRes = await request('POST', '/api/targets', createBody)
    const targetId = createRes.body.id

    const updateBody = { maxAcceptsPerDay: 'not-a-number' }

    const res = await request('POST', `/api/target/${targetId}`, updateBody)

    t.is(res.statusCode, 400, 'correct error statusCode')
    t.regex(
      res.body.error,
      /non-negative integer/i,
      'appropriate error message'
    )
  }
)

test.serial('POST /api/target/:id - update accept criteria', async (t) => {
  const createBody = {
    url: 'https://criteria.com',
    value: '1.00',
    maxAcceptsPerDay: '10',
    accept: { geoState: { $in: ['ca'] } }
  }

  const createRes = await request('POST', '/api/targets', createBody)
  const targetId = createRes.body.id

  const updateBody = {
    accept: {
      geoState: { $in: ['ny', 'tx'] },
      hour: { $in: ['10', '11'] }
    }
  }

  const res = await request('POST', `/api/target/${targetId}`, updateBody)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.deepEqual(res.body.accept, updateBody.accept, 'accept criteria updated')
})

// ============================================================================
// ROUTING TESTS (POST /route)
// ============================================================================

test.serial('POST /route - accept visitor matching criteria', async (t) => {
  const targetData = {
    url: 'http://accept.com',
    value: '1.00',
    maxAcceptsPerDay: '10',
    accept: {
      geoState: { $in: ['ca', 'ny'] },
      hour: { $in: ['14'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ca',
    publisher: 'abc',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'accept', 'visitor accepted')
  t.is(res.body.target.url, targetData.url, 'target url matches')
  t.is(res.body.target.value, targetData.value, 'target value matches')
  t.truthy(res.body.target.id, 'target id present')
})

test.serial('POST /route - reject visitor wrong state', async (t) => {
  const targetData = {
    url: 'http://reject-state.com',
    value: '0.50',
    maxAcceptsPerDay: '5',
    accept: {
      geoState: { $in: ['ca'] },
      hour: { $in: ['14'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ny',
    publisher: 'xyz',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'reject', 'visitor rejected')
  t.falsy(res.body.target, 'no target returned')
})

test.serial('POST /route - reject visitor wrong hour', async (t) => {
  const targetData = {
    url: 'http://reject-hour.com',
    value: '0.75',
    maxAcceptsPerDay: '8',
    accept: {
      geoState: { $in: ['ca'] },
      hour: { $in: ['13', '14', '15'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ca',
    publisher: 'xyz',
    timestamp: '2018-07-19T16:28:59.513Z' // Hour 16, not in accepted hours
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'reject', 'visitor rejected')
})

test.serial('POST /route - case insensitive state matching', async (t) => {
  const targetData = {
    url: 'http://case-insensitive.com',
    value: '1.25',
    maxAcceptsPerDay: '5',
    accept: {
      geoState: { $in: ['CA', 'NY'] }, // Uppercase in target
      hour: { $in: ['14'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ca', // Lowercase in visitor
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(
    res.body.decision,
    'accept',
    'visitor accepted with case insensitive matching'
  )
})

test.serial('POST /route - select highest value target', async (t) => {
  const targets = [
    {
      url: 'http://low-value.com',
      value: '0.25',
      maxAcceptsPerDay: '10',
      accept: { geoState: { $in: ['ca'] }, hour: { $in: ['14'] } }
    },
    {
      url: 'http://high-value.com',
      value: '2.50',
      maxAcceptsPerDay: '10',
      accept: { geoState: { $in: ['ca'] }, hour: { $in: ['14'] } }
    },
    {
      url: 'http://medium-value.com',
      value: '1.00',
      maxAcceptsPerDay: '10',
      accept: { geoState: { $in: ['ca'] }, hour: { $in: ['14'] } }
    }
  ]

  for (const target of targets) {
    await request('POST', '/api/targets', target)
  }

  const visitorData = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'accept', 'visitor accepted')
  t.is(
    res.body.target.url,
    'http://high-value.com',
    'highest value target selected'
  )
  t.is(res.body.target.value, '2.50', 'correct value returned')
})

test.serial('POST /route - respect daily limits', async (t) => {
  const targetData = {
    url: 'http://limited.com',
    value: '1.00',
    maxAcceptsPerDay: '2', // Only 2 accepts per day
    accept: {
      geoState: { $in: ['ca'] },
      hour: { $in: ['14'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  // First request should be accepted
  const res1 = await request('POST', '/route', visitorData)
  t.is(res1.body.decision, 'accept', 'first visitor accepted')

  // Second request should be accepted
  const res2 = await request('POST', '/route', visitorData)
  t.is(res2.body.decision, 'accept', 'second visitor accepted')

  // Third request should be rejected (limit reached)
  const res3 = await request('POST', '/route', visitorData)
  t.is(
    res3.body.decision,
    'reject',
    'third visitor rejected due to daily limit'
  )
})

test.serial('POST /route - no targets available', async (t) => {
  const visitorData = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'reject', 'visitor rejected when no targets')
})

test.serial(
  'POST /route - target with no accept criteria accepts all',
  async (t) => {
    const targetData = {
      url: 'http://accept-all.com',
      value: '1.00',
      maxAcceptsPerDay: '10'
      // No accept criteria - should accept all visitors
    }

    await request('POST', '/api/targets', targetData)

    const visitorData = {
      geoState: 'unknown',
      publisher: 'test',
      timestamp: '2018-07-19T23:59:59.513Z' // Any hour
    }

    const res = await request('POST', '/route', visitorData)

    t.is(res.statusCode, 200, 'correct statusCode')
    t.is(
      res.body.decision,
      'accept',
      'visitor accepted by target with no criteria'
    )
  }
)

test.serial('POST /route - missing geoState field', async (t) => {
  const visitorData = {
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
  t.regex(
    res.body.error,
    /missing required fields/i,
    'appropriate error message'
  )
})

test.serial('POST /route - missing timestamp field', async (t) => {
  const visitorData = {
    geoState: 'ca',
    publisher: 'test'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 400, 'correct error statusCode')
  t.truthy(res.body.error, 'error message present')
})

test.serial('POST /route - different days reset daily limits', async (t) => {
  const targetData = {
    url: 'http://daily-reset.com',
    value: '1.00',
    maxAcceptsPerDay: '1',
    accept: {
      geoState: { $in: ['ca'] },
      hour: { $in: ['14'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  // First day
  const visitor1 = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res1 = await request('POST', '/route', visitor1)
  t.is(res1.body.decision, 'accept', 'first day visitor accepted')

  // Second day (different date)
  const visitor2 = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-20T14:28:59.513Z'
  }

  const res2 = await request('POST', '/route', visitor2)
  t.is(
    res2.body.decision,
    'accept',
    'second day visitor accepted (limit reset)'
  )
})

test.serial('POST /route - invalid timestamp format', async (t) => {
  const visitorData = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: 'invalid-timestamp'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 400, 'returns 400 for invalid timestamp')
  t.truthy(res.body.error, 'error message present')
  t.regex(res.body.error, /invalid timestamp/i, 'appropriate error message')
})

// ============================================================================
// METHOD NOT ALLOWED TESTS
// ============================================================================

test.serial('PUT /api/targets - method not allowed', async (t) => {
  const res = await request('PUT', '/api/targets', { url: 'http://example.com', value: '1.00', maxAcceptsPerDay: '10' })

  t.is(res.statusCode, 405, 'method not allowed statusCode')
  t.truthy(res.body.error, 'error message present')
})

test.serial('DELETE /api/target/123 - method not allowed', async (t) => {
  const res = await request('DELETE', '/api/target/123')

  t.is(res.statusCode, 405, 'method not allowed statusCode')
})

test.serial('GET /route - method not allowed', async (t) => {
  const res = await request('GET', '/route')

  t.is(res.statusCode, 405, 'method not allowed statusCode')
})

// ============================================================================
// EDGE CASE AND BOUNDARY TESTS
// ============================================================================

test.serial('POST /route - edge case: midnight hour (0)', async (t) => {
  const targetData = {
    url: 'http://midnight.com',
    value: '1.00',
    maxAcceptsPerDay: '10',
    accept: {
      geoState: { $in: ['ca'] },
      hour: { $in: ['0', '1', '23'] } // Include midnight
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-19T00:28:59.513Z' // Midnight UTC
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'accept', 'midnight visitor accepted')
})

test.serial('POST /route - very high value target', async (t) => {
  const targetData = {
    url: 'http://expensive.com',
    value: '999.99',
    maxAcceptsPerDay: '1'
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'ca',
    publisher: 'test',
    timestamp: '2018-07-19T14:28:59.513Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'accept', 'high value target accepted')
  t.is(res.body.target.value, '999.99', 'correct high value returned')
})

test.serial('POST /route - complex accept criteria', async (t) => {
  const targetData = {
    url: 'http://complex.com',
    value: '1.50',
    maxAcceptsPerDay: '5',
    accept: {
      geoState: { $in: ['ca', 'ny', 'tx', 'fl'] },
      hour: { $in: ['9', '10', '11', '12', '13', '14', '15', '16', '17'] }
    }
  }

  await request('POST', '/api/targets', targetData)

  const visitorData = {
    geoState: 'tx',
    publisher: 'complex-test',
    timestamp: '2018-07-19T12:30:45.123Z'
  }

  const res = await request('POST', '/route', visitorData)

  t.is(res.statusCode, 200, 'correct statusCode')
  t.is(res.body.decision, 'accept', 'complex criteria matched')
})
