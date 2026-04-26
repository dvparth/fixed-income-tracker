import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import mongoose from 'mongoose'
import { emptyMasterData, normalizeMasterData } from '../shared/masterData.js'

dotenv.config()

const app = express()
const PORT = Number(process.env.PORT || 4000)
const mongoUri = process.env.MONGO_URI

if (!mongoUri) {
  throw new Error('MONGO_URI is missing from the environment')
}

const depositSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
  },
  {
    strict: false,
    versionKey: false,
    timestamps: true,
  },
)

const Deposit = mongoose.model('Deposit', depositSchema)

const masterDataSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    owners: { type: Array, default: [] },
    institutions: { type: Array, default: [] },
    instrumentTypes: { type: Array, default: [] },
  },
  {
    versionKey: false,
    timestamps: true,
  },
)

const MasterData = mongoose.model('MasterData', masterDataSchema)

const getMaturitySourceEventId = (depositId) => `maturity:${depositId}`

const normalizeDepositDoc = (deposit) => ({
  ...deposit,
  id: deposit.id || String(deposit._id),
  allocations: deposit.allocations || [],
  isDeleted: Boolean(deposit.isDeleted),
})

const getFundingAllocations = (deposit) => {
  return (deposit.allocations || []).filter(
    (allocation) => allocation?.eventId && Number.isFinite(Number(allocation.amount)),
  )
}

const getArchiveDependents = (targetDeposit, deposits) => {
  const maturityEventId = getMaturitySourceEventId(targetDeposit.id)
  const interestPrefix = `interest:${targetDeposit.id}:`

  return deposits
    .filter((deposit) => deposit.id !== targetDeposit.id && !deposit.isDeleted)
    .map((deposit) => {
      const matchingAllocations = getFundingAllocations(deposit).filter((allocation) => {
        const eventId = String(allocation.eventId || '')
        return eventId === maturityEventId || eventId.startsWith(interestPrefix)
      })

      if (matchingAllocations.length === 0) {
        return null
      }

      return {
        id: deposit.id,
        bankName: deposit.bankName,
        accountNumber: deposit.accountNumber,
        allocations: matchingAllocations,
      }
    })
    .filter(Boolean)
}

const buildUpdateQuery = (id) => {
  if (mongoose.Types.ObjectId.isValid(id)) {
    return {
      $or: [{ id }, { _id: new mongoose.Types.ObjectId(id) }],
    }
  }

  return { id }
}

const connectDatabase = async () => {
  await mongoose.connect(mongoUri)
}

const getMasterData = async () => {
  const existing = await MasterData.findOne({ key: 'default' }).lean()

  if (!existing) {
    const created = await MasterData.create({
      key: 'default',
      ...emptyMasterData,
    })
    return normalizeMasterData(created.toObject())
  }

  return normalizeMasterData(existing)
}

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ ok: true })
})

app.get('/api/deposits', async (_request, response) => {
  const deposits = await Deposit.find({}).lean()
  response.json(deposits.map(normalizeDepositDoc))
})

app.get('/api/master-data', async (_request, response) => {
  response.json(await getMasterData())
})

app.put('/api/master-data', async (request, response) => {
  const normalized = normalizeMasterData(request.body || {})
  const updated = await MasterData.findOneAndUpdate(
    { key: 'default' },
    {
      key: 'default',
      ...normalized,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean()

  response.json(normalizeMasterData(updated))
})

app.post('/api/deposits', async (request, response) => {
  const created = await Deposit.create(request.body)
  response.status(201).json(normalizeDepositDoc(created.toObject()))
})

app.put('/api/deposits/:id', async (request, response) => {
  const updated = await Deposit.findOneAndUpdate(
    buildUpdateQuery(request.params.id),
    request.body,
    { new: true, upsert: false },
  ).lean()

  if (!updated) {
    response.status(404).json({ message: 'Deposit not found' })
    return
  }

  response.json(normalizeDepositDoc(updated))
})

app.post('/api/deposits/:id/archive', async (request, response) => {
  const existing = await Deposit.findOne(buildUpdateQuery(request.params.id)).lean()

  if (!existing) {
    response.status(404).json({ message: 'Deposit not found' })
    return
  }

  const normalizedExisting = normalizeDepositDoc(existing)
  if (normalizedExisting.isDeleted) {
    response.json(normalizedExisting)
    return
  }

  const allDeposits = (await Deposit.find({}).lean()).map(normalizeDepositDoc)
  const dependents = getArchiveDependents(normalizedExisting, allDeposits)

  if (dependents.length > 0) {
    const dependentLabels = dependents
      .map((deposit) => deposit.accountNumber || deposit.bankName || deposit.id)
      .join(', ')

    response.status(409).json({
      message: `Cannot archive this investment because it is still used as a funding source by: ${dependentLabels}`,
      dependents,
    })
    return
  }

  const archived = await Deposit.findOneAndUpdate(
    buildUpdateQuery(request.params.id),
    {
      isDeleted: true,
      deletedAt: new Date().toISOString(),
    },
    { new: true, upsert: false },
  ).lean()

  response.json(normalizeDepositDoc(archived))
})

// Express recognizes error middleware only when all 4 parameters are present.
// eslint-disable-next-line no-unused-vars
app.use((error, _request, response, _next) => {
  console.error(error)
  response.status(500).json({
    message: error?.message || 'Unexpected server error',
  })
})

const start = async () => {
  await connectDatabase()
  app.listen(PORT, () => {
    console.log(`FD tracker API listening on http://localhost:${PORT}`)
  })
}

start().catch((error) => {
  console.error('Failed to start server', error)
  process.exit(1)
})
