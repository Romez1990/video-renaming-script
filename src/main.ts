import { promises as fs, Stats } from 'fs'
import path from 'path'
import { config as loadEnv } from 'dotenv'
import { pipe, constVoid } from 'fp-ts/function'
import * as A from 'fp-ts/ReadonlyArray'
import * as T from 'fp-ts/Task'
import { Task } from 'fp-ts/Task'

loadEnv()

function getEnv(name: string): string {
    const value = process.env[name]
    if (typeof value === 'undefined')
        throw new Error()
    return value
}

const videosFolder = getEnv('VIDEOS_FOLDER')
const videoNamesFile = path.resolve(videosFolder, getEnv('VIDEO_NAMES'))

const main = (): Task<void> =>
    pipe(
        readVideoNames(),
        T.chain(videoNames =>
            pipe(
                getVideoPaths(),
                T.map(filterVideos),
                T.chain(videos =>
                    pipe(
                        videos,
                        A.map(renameVideo(videoNames)),
                        T.sequenceArray,
                        T.map(constVoid),
                    ),
                ),
            ),
        ),
    )

const readVideoNames = (): Task<ReadonlyArray<string>> =>
    pipe(
        () => fs.readFile(videoNamesFile, 'utf-8'),
        T.map(content =>
            pipe(
                content,
                content => content.split('\n'),
                A.map(name => name.trim()),
            ),
        ),
    )

function getVideoName(videoNames: ReadonlyArray<string>, videoNumber: number): string {
    const videoName = videoNames[videoNumber - 1]
    if (typeof videoName === 'undefined')
        throw new Error()
    return videoName
}

const getVideoPaths = (): Task<ReadonlyArray<string>> =>
    pipe(
        () => fs.readdir(videosFolder),
        T.map(A.map(fsPath => path.resolve(videosFolder, fsPath))),
        T.chain(filterByStats(stats => stats.isDirectory())),
        T.chain(videosSubFolders =>
            pipe(
                videosSubFolders,
                A.map(videoSubFolder =>
                    pipe(
                        () => fs.readdir(videoSubFolder),
                        T.map(A.map(fsPath => path.resolve(videoSubFolder, fsPath))),
                    ),
                ),
                T.sequenceArray,
                T.map(A.flatten),
            ),
        ),
    )

interface FileStats {
    path: string
    stats: Stats
}

const filterByStats = (predicate: (stats: Stats) => boolean) => (paths: ReadonlyArray<string>): Task<ReadonlyArray<string>> =>
    pipe(
        paths,
        A.map(path =>
            pipe(
                () => fs.lstat(path),
                T.map((stats): FileStats => ({ path, stats })),
            ),
        ),
        T.sequenceArray,
        T.map(A.filter(({ stats }) => predicate(stats))),
        T.map(A.map(({ path }) => path)),
    )

interface BaseVideo {
    path: string
    name: string
}

interface InvalidVideo extends BaseVideo {
    number: undefined
}

interface ValidVideo extends BaseVideo {
    number: number
}

type Video = InvalidVideo | ValidVideo

const filterVideos = (videoPaths: ReadonlyArray<string>): ReadonlyArray<ValidVideo> =>
    pipe(
        videoPaths,
        A.map((videoPath): Video => {
            const name = path.basename(videoPath)
            return ({
                path: videoPath,
                name,
                number: parseVideoName(name),
            })
        }),
        A.filter((video): video is ValidVideo => typeof video.number !== 'undefined'),
    )

const videoNameRegex = /^lesson(?<number>\d{1,3})\.mp4$/

function parseVideoName(videoName: string): number | undefined {
    const match = videoName.match(videoNameRegex)
    if (match === null) return undefined
    if (typeof match.groups === 'undefined') throw new Error()
    const { number } = match.groups
    if (typeof number === 'undefined') throw new Error()
    return parseInt(number)
}

const renameVideo = (videoNames: ReadonlyArray<string>) => ({ path: videoPath, number }: ValidVideo): Task<void> => {
    const videoName = getVideoName(videoNames, number)
    const newVideoName = `${number} ${videoName}.mp4`
    const folderPath = path.dirname(videoPath)
    return () => fs.rename(videoPath, path.resolve(folderPath, newVideoName))
}

const run = <T>(task: Task<T>): Promise<void | T> =>
    task()
        .catch(error => console.error(error.message))

run(main())
