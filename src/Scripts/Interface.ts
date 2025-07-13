export interface VideoQueueStorage {
    blob: Blob,
    name: string,
    duration: number
}

export interface OpenSourceLicense {
    type: "mit" | "bsd3",
    author: string
}

export interface QueueProp {
    description: string,
    id: string,
    progress: number,
    max: number
}