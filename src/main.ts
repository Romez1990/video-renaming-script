import path from 'path'
import { config as loadEnv } from 'dotenv'

loadEnv()

function getEnv(name: string): string {
    const value = process.env[name]
    if (typeof value === 'undefined')
        throw new Error()
    return value
}

const videosFolder = getEnv('VIDEOS_FOLDER')
const videoNamesFile = path.resolve(videosFolder, getEnv('VIDEO_NAMES'))
