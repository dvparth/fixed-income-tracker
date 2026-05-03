import dotenv from 'dotenv'
import mongoose from 'mongoose'
import { DEFAULT_DEMO_OWNER_ID, buildDemoPortfolioSnapshot } from '../shared/demoPortfolio.js'
import { normalizeMasterData } from '../shared/masterData.js'

dotenv.config()

const mongoUri = process.env.SERVER_MONGO_URI
const ownerUserId = String(process.env.SERVER_DEMO_OWNER_ID || DEFAULT_DEMO_OWNER_ID).trim()

if (!mongoUri) {
  throw new Error('SERVER_MONGO_URI is required to seed the demo portfolio')
}

if (!ownerUserId) {
  throw new Error('SERVER_DEMO_OWNER_ID must not be empty')
}

const depositSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
  },
  {
    collection: 'investments',
    strict: false,
    versionKey: false,
    timestamps: true,
  },
)

const masterDataSchema = new mongoose.Schema(
  {
    ownerUserId: { type: String, required: true, unique: true, index: true },
    owners: { type: Array, default: [] },
    institutions: { type: Array, default: [] },
    instrumentTypes: { type: Array, default: [] },
  },
  {
    collection: 'masterData',
    versionKey: false,
    timestamps: true,
  },
)

const Deposit = mongoose.model('Deposit', depositSchema)
const MasterData = mongoose.model('MasterData', masterDataSchema)

const seed = async () => {
  const snapshot = buildDemoPortfolioSnapshot(ownerUserId)
  const masterData = normalizeMasterData(snapshot.masterData)

  await mongoose.connect(mongoUri)

  await Deposit.deleteMany({ ownerUserId })
  if (snapshot.deposits.length > 0) {
    await Deposit.collection.insertMany(snapshot.deposits, { ordered: true })
  }

  await MasterData.findOneAndUpdate(
    { ownerUserId },
    {
      ownerUserId,
      ...masterData,
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  )

  console.log(
    `Seeded ${snapshot.deposits.length} demo investments for ${snapshot.portfolioLabel} (${ownerUserId})`,
  )
}

seed()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await mongoose.disconnect()
  })
