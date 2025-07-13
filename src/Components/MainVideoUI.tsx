import { useEffect, useRef, useState } from "react"
import Card from "./Card"
import DownloadContent from "../Scripts/DownloadContent";
import ExtractVideoFrame from "../Scripts/ExtractVideoFrame";
import ZipOptionsCallback from "./ZipOptionsCallback";
import { type QueueProp, type VideoQueueStorage } from "../Scripts/Interface";
import VideoQueue from "./VideoQueue";
import ImageButton from "./ImageButton";
import { lang } from "../Scripts/Translations";
import OperationTracker from "./OperationTracker";
import { createRoot } from "react-dom/client";
import ShowOperationTracker from "./ShowOperationTracker";

interface Props {
    /**
     * The File of the video the user has chosen
     */
    video: File,
    /**
     * The Blob URL that permits video playback.
     */
    videoBlobUrl: string
}


/**
 * Export options that can be changed without triggering a re-render.
 */
interface ExportOptions {
    /**
     * A number, from 0 to 1, that indicates the output image quality
     */
    quality: number,
    /**
     * The mimetype of the output image
     */
    outputFormat: "jpeg" | "png" | "webp",
    /**
     * If the video position should be changed when the user changes the from/to inputs in the "Interval export" section
     */
    updateFrameWhileMovingInput: boolean,
    /**
     * If a new Video object should be created for the video interval exportation
     */
    createNewVideoElement: boolean,
    /**
     * A number between 0 and 1 that indicates the percentage of the width/height of the output image compared to its original size.
     */
    resizePercentage: number,
    /**
     * The output width or height. The other value must be resized according to the source's aspect ratio.
     */
    resizeFixed: number
}

/**
 * Export options that, due to their nature, must trigger a re-render (so that more controls can be shown)
 */
interface ExportRerenderOptions {
    /**
     * If `singleFrame` is set, only the current frame will be saved.
     * 
     * If `interval` is set, the user will be propted to choose an interval of seconds, and all the frames between them will be downloaded
     */
    exportType: "singleFrame" | "interval",
    /**
     * If the image should be resized or not
     */
    resizeImage: boolean,
    /**
     * How the image should be resized? Should we calculate it based on the `percentage`? Should the user specify a `width` or a `height`?
     */
    resizeType: "percentage" | "width" | "height",
}

/**
 * The core of the application. Calculate the framerate of the video, and display it along with conversion options.
 * @returns the MainVideoUI ReactNode
 */
export default function MainVideoUI({ video, videoBlobUrl }: Props) {
    const [videoFrameRate, updateVideoFrameRate] = useState<number>();
    const [isVideoPaused, updateVideoPaused] = useState(false);
    const [areVideoControlsDisabled, updateVideoControlsDisabled] = useState(false);

    /**
     * Video exportation options that don't require a re-render
     */
    const videoExportOptions = useRef<ExportOptions>({
        quality: 0.9,
        outputFormat: "jpeg",
        updateFrameWhileMovingInput: true,
        createNewVideoElement: true,
        resizePercentage: 1,
        resizeFixed: 1000
    })

    const [videoSensitiveExportOptions, updateVideoSensitiveExportOptions] = useState<ExportRerenderOptions>({
        exportType: "singleFrame",
        resizeImage: false,
        resizeType: "percentage",
        
    });
    const [videoIntervalOptions, updateVideoIntervalOptions] = useState({
        downloadType: "zip",
        useServiceWorker: true
    })
    /**
     * Get the suggested file name for the extracted frame
     * @param videoObject the HTMLVideoElement that'll be used to get the currentTime
     * @param exportOptions the ExportOptions Object that is being used for this conversion. If not passed, the default one will be used. Note that this is important for interval conversions, since the user might change the settings while a conversion is being made.
     * @returns a string with the suggested file name for the image
     */
    function getFileName(videoObject?: HTMLVideoElement, exportOptions = videoExportOptions.current) {
        return `${video.name.substring(0, video.name.lastIndexOf("."))}-${(videoObject ?? videoObj.current)?.currentTime.toFixed(2)}.${exportOptions.outputFormat === "jpeg" ? "jpg" : exportOptions.outputFormat}`;
    }
    /**
     * An array that contains the start and the end of the interval (for multiple frames extraction)
     */
    const videoExportInterval = useRef<[number | undefined, number | undefined]>([undefined, undefined]);
    /**
     * The main video object, the one that'll always be visible
     */
    const videoObj = useRef<HTMLVideoElement>(null);
    /**
     * The Promise that should be resolved when the frame has been rendered by the browser.
     * Note that this promise is used only by the operations that use the main video (`videoObj`) for frame exportation.
     */
    const seekedPromise = useRef<() => void>(null);
    /**
     * The videos that have been added in the exportation list
     */
    const [videoInExportationList, updateVideoInExportationList] = useState<VideoQueueStorage[]>([]);
    /**
     * The list of the ongoing conversions
     */
    const [operationList, updateOperationList] = useState<QueueProp[]>([]);
    /**
     * Resize the image if requested by the user, and obtain the video frame as a Blob
     * @param videoObject the HTMLVideoElement that should be used to extract the frame
     * @param exportOptions the ExportOptions Object that is being used for this conversion. If not passed, the default one will be used. Note that this is important for interval conversions, since the user might change the settings while a conversion is being made.
     * @param videoSensitiveOptions the ExportRerenderOptions Object that is being used for this conversion. If not passed, the default one will be used. Note that this is important for interval conversions, since the user might change the settings while a conversion is being made.
     * @returns a Blob with the current frame
     */
    function ExtractVideoWrapper(videoObject = videoObj.current ?? undefined, videoOptions = videoExportOptions.current, videoSensitiveOptions = videoSensitiveExportOptions) {
        if (!videoObject) throw new Error("Failed getting video object");
        let [width, height] = [videoObject.videoWidth, videoObject.videoHeight];
        if (videoSensitiveOptions.resizeImage) {
            switch(videoSensitiveOptions.resizeType) {
                case "percentage":
                    width *= videoOptions.resizePercentage;
                    height *= videoOptions.resizePercentage;
                    break;
                case "width":
                    width = videoOptions.resizeFixed;
                    height = width * videoObject.videoHeight / videoObject.videoWidth
                    break;
                case "height": 
                    height = videoOptions.resizeFixed;
                    width = height * videoObject.videoWidth / videoObject.videoHeight
                    break;
            }
        }
        return ExtractVideoFrame({ video: videoObject ?? (videoObj.current as HTMLVideoElement), quality: videoOptions.quality, format: videoOptions.outputFormat, width, height })
    }
    
    useEffect(() => {
        setTimeout(() => {
            // Let's create a new Video object and let's play it for two seconds so that we can get the framerate.
            const video = Object.assign(document.createElement("video"), {
                muted: true,
                autoplay: true,
                src: videoBlobUrl
            });
            video.classList.add("hideVideo"); // Let's make this video invisible to the user
            video.addEventListener("playing", () => {
                /**
                 * Getting video framerate is unreliable in JavaScript.
                 * What we'll do is to ask the browser to send a callback for each frame, and we'll see how much time has passed from a frame to the other.
                 * We'll observe this for approximately two seconds, and later the greatest number of frames will be chosen.
                 */
                let prevMediaTime = Date.now();
                /**
                 * An object that'll have as a key the number of frames, and as a value the times the browser kept this value.
                 */
                let probabilities: any = {}
                const callback = (_: any, metadata: VideoFrameCallbackMetadata) => {
                    const frameTime = metadata.mediaTime - prevMediaTime; // Get the time that has passed from the previous frame to this one.
                    prevMediaTime = metadata.mediaTime;
                    const result = Math.round(1 / frameTime); // Get the suggested framerate
                    if (!probabilities[result.toString()]) probabilities[result.toString()] = 0;
                    probabilities[result.toString()]++;
                    video.requestVideoFrameCallback(callback);
                }
                setTimeout(() => {
                    video.pause();
                    // Now let's get the key that has the greatest value. This means that the key is the most probable framerate.
                    let currentPosition = Object.keys(probabilities)[0];
                    for (const key in probabilities) {
                        if (probabilities[key] > probabilities[currentPosition]) currentPosition = key;
                    }
                    updateVideoFrameRate(+currentPosition);
                    video.remove();
                }, 2000);
                video.requestVideoFrameCallback(callback); // At every frame, call the "callback" function
            })
            document.body.append(video);
        }, 500)
    }, [])
    return !videoFrameRate ? <>
        <Card>
            <h2>{lang("Analyzing video framerate")}</h2>
            <p>{lang("Do not switch tabs. This should take approximately three seconds.")}</p>
        </Card>
    </> : <>
        <Card>
            <div className="flex mainFlex gap">
                <div style={{ flex: "2 0" }} key={"VideoPreviewStable"}>
                    <Card secondLevel={true}>
                        <h2>{lang("Video preview:")}</h2>
                        <div className="flex wcenter">
                            <video onPlay={() => updateVideoPaused(false)} onPause={() => updateVideoPaused(true)} onSeeked={() => seekedPromise.current && seekedPromise.current()} ref={videoObj} controls autoPlay muted src={videoBlobUrl}></video>
                        </div><br></br>
                        <div className="flex wcenter miniButton miniGap" key={"VideoControls"}>
                            <ImageButton disabled={areVideoControlsDisabled} img="previousFrame" onClick={() => {
                                if (!videoObj.current) return;
                                videoObj.current.currentTime -= (1 / videoFrameRate);
                            }}>{lang("Previous frame")}</ImageButton>
                            <ImageButton disabled={areVideoControlsDisabled} img={isVideoPaused ? "play" : "pause"} onClick={() => {
                                videoObj.current?.paused ? videoObj.current.play() : videoObj.current?.pause()
                            }}>{isVideoPaused ? lang("Play") : lang("Pause")}</ImageButton>
                            <ImageButton disabled={areVideoControlsDisabled} img="nextFrame" onClick={() => {
                                if (!videoObj.current) return;
                                videoObj.current.currentTime += (1 / videoFrameRate);
                            }}>{lang("Next frame")}</ImageButton>
                        </div>
                    </Card>
                </div>
                <div style={{ flex: "1 0 150px" }}>
                    <Card secondLevel={true}>
                        <h2>{lang("Export frame:")}</h2>
                        <select disabled={areVideoControlsDisabled} onChange={(e) => {
                            updateVideoSensitiveExportOptions(prev => { return { ...prev, exportType: e.target.value as "singleFrame" } })
                        }}>
                            <option value={"singleFrame"}>{lang("Export single frame")}</option>
                            <option value={"interval"}>{lang("Export frame interval")}</option>
                        </select><br></br><br></br>
                        {videoSensitiveExportOptions.exportType === "singleFrame" ? <>
                            <div className="flex gap mainFlex mainMiniFlex">
                                <ImageButton onClick={async () => new DownloadContent("link").downloadFile({filename: getFileName(), content: await ExtractVideoWrapper() })} img="saveImage">{lang("Export current frame")}</ImageButton>
                                <ImageButton img="shareios" onClick={async () => {
                                    const blob = await ExtractVideoWrapper();
                                    navigator.share({
                                        files: [new File([blob], getFileName(), { type: blob.type })]
                                    })
                                }}>{lang("Share current frame")}</ImageButton>
                                <ImageButton img="imageAdd" onClick={async () => { // Add image in the exportation list
                                    const videoQueue: VideoQueueStorage = {
                                        blob: await ExtractVideoWrapper(),
                                        name: getFileName(),
                                        duration: videoObj.current?.currentTime ?? 0
                                    }
                                    updateVideoInExportationList(prev => [...prev, videoQueue]);
                                }}>
                                    {lang("Add current frame to export list")}
                                </ImageButton>
                            </div><br></br><br></br>
                            <VideoQueue updateOperationList={updateOperationList} updateQueueFiles={updateVideoInExportationList} queueFiles={videoInExportationList} video={video} callback={(time) => {
                                if (videoObj.current) videoObj.current.currentTime = time;
                            }}></VideoQueue>
                        </> : <div>
                            <p>{lang("Download all frames")}</p>
                            <label className="flex hcenter gap">{lang("From")}: <input disabled={areVideoControlsDisabled} type="number" min={0} step={1 / videoFrameRate} max={videoObj.current?.duration} onChange={(e) => {
                                videoExportInterval.current[0] = +e.target.value;
                                if (videoExportOptions.current.updateFrameWhileMovingInput && videoObj.current) videoObj.current.currentTime = videoExportInterval.current[0];
                            }} defaultValue={0}></input> {lang("seconds")}</label><br></br>
                            <label className="flex hcenter gap">{lang("To")}: <input type="number" disabled={areVideoControlsDisabled} min={0} step={1 / videoFrameRate} max={videoObj.current?.duration} onChange={e => {
                                videoExportInterval.current[1] = +e.target.value;
                                if (videoExportOptions.current.updateFrameWhileMovingInput && videoObj.current) videoObj.current.currentTime = videoExportInterval.current[1];
                            }} defaultValue={videoObj.current?.duration}></input> {lang("seconds")}</label><br></br>
                            <label className="flex hcenter gap">
                                <input type="checkbox" disabled={areVideoControlsDisabled} defaultChecked={videoExportOptions.current.updateFrameWhileMovingInput} onChange={(e) => (videoExportOptions.current.updateFrameWhileMovingInput = e.target.checked)}></input>{lang("Update the video position while changing from/to seconds")}
                            </label><br></br>
                            <ZipOptionsCallback disabled={areVideoControlsDisabled} otherAdvancedOptions={
                            <label className="flex hcenter gap">
                                <input disabled={areVideoControlsDisabled} type="checkbox" defaultChecked={videoExportOptions.current.createNewVideoElement} onChange={(e) => (videoExportOptions.current.createNewVideoElement = e.target.checked)}></input>
                                {lang("Create a new video element for this operation. This will allow you to download multiple intervals at the same time, but it will increment RAM usage.")}
                            </label>
                            } callback={(value) => {
                                updateVideoIntervalOptions(prev => { return { ...prev, ...value } });
                            }}></ZipOptionsCallback><br></br>
                            <ImageButton disabled={areVideoControlsDisabled} img="videoclipoptimize" onClick={async () => { // Download the interval
                                /**
                                 * The Promise that'll be solved when the browser has rendered the frame
                                 */
                                let localSeekedPromise: (() => void) | null = null;
                                const createNewVideoElement = !!videoExportOptions.current.createNewVideoElement;
                                const [videoObject, isLocalVideoObject] = await new Promise<[HTMLVideoElement, boolean]>(res => {
                                    !createNewVideoElement && videoObj.current && res([videoObj.current, false]); // In this case, we'll use the main video object.
                                    const newVideo = Object.assign(document.createElement("video"), { // Create the Video element that'll be used for this operation
                                        src: videoBlobUrl,
                                        autoplay: true,
                                        muted: true,
                                        onload: () => newVideo.play(),
                                        onplay: () => {
                                            newVideo.pause();
                                            res([newVideo, true]);
                                        },
                                        onseeked: () => {localSeekedPromise && localSeekedPromise()}
                                    });
                                    newVideo.classList.add("hideVideo");
                                    document.body.append(newVideo);
                                })
                                try {
                                    const [videoOptions, videoSensitiveOptions] = [{...videoExportOptions.current}, {...videoSensitiveExportOptions}]; // We'll copy these two object so that, if the user changes some values, they won't alter the current interval download.
                                    !createNewVideoElement && updateVideoControlsDisabled(true); // If the main video element is being used, disable the controls so that 
                                    if (!videoExportInterval.current[0]) videoExportInterval.current[0] = 0; // The start of the interval
                                    videoObject.currentTime = videoExportInterval.current[0]; 
                                    let currentPosition = videoObject.currentTime;
                                    const max = videoExportInterval.current[1] ?? videoObject.duration; // The end of the interval
                                    const intervalOptions = { ...videoIntervalOptions };
                                    const zipFileName = `${video.name.substring(0, video.name.lastIndexOf("."))} [${videoExportInterval.current[0]}-${videoExportInterval.current[1]}].zip`;
                                    const downloadContent = new DownloadContent(intervalOptions.downloadType === "zip" ? intervalOptions.useServiceWorker ? "zipstream" : "zipblob" : intervalOptions.downloadType === "share" ? "share" : "link", zipFileName); // Initialize the downloader
                                    updateOperationList(prev => [...prev, { // Add this extraction to the current list
                                        id: downloadContent.operationId,
                                        description: `${lang("Extracting frame interval between")} ${currentPosition} ${lang("and")} ${max} ${lang("seconds")}`,
                                        max: (max - currentPosition) * videoFrameRate,
                                        progress: -1
                                    }]);
                                    if (localStorage.getItem("VideoFrameExtractor-ShowDocumentQueue") !== "a") { // Show the user where they can track the extraction progress
                                        const div = document.createElement("div");
                                        const root = createRoot(div);
                                        root.render(<ShowOperationTracker close={() => {
                                            root.unmount();
                                            div.remove();
                                        }}></ShowOperationTracker>)
                                        document.body.append(div);
                                    }
                                    while (currentPosition < max) { // Extract the frames
                                        videoObject.pause();
                                        await downloadContent.downloadFile({ filename: getFileName(videoObject, videoOptions), content: await ExtractVideoWrapper(videoObject, videoOptions, videoSensitiveOptions) }); // Download the file, or add it to the zip file.
                                        currentPosition += (1 / videoFrameRate); 
                                        if (currentPosition < max) { // If the next frame should be extracted, let's wait that the browser renders it. 
                                            await new Promise<void>(res => {
                                                if (isLocalVideoObject) localSeekedPromise = res; else seekedPromise.current = res;
                                                videoObject.currentTime = currentPosition; // Go to the next frame
                                            })
                                        };
                                        updateOperationList(prev => { // Update the progress of the operation
                                            const entry = prev.findIndex(item => item.id === downloadContent.operationId);
                                            if (entry !== -1) prev[entry].progress++;
                                            return [...prev];
                                        })
                                    }
                                    await downloadContent.releaseFile(zipFileName); // In case of zip files, they'll be closed and downloaded
                                    videoObject.controls = true; // Show again the controls of the video object
                                    !createNewVideoElement && updateVideoControlsDisabled(false); // Enable again the components
                                    isLocalVideoObject && videoObject.remove(); // And remove the videoObject if it was created only for this extraction
                                    updateOperationList(prev => { // Delete the current extraction from the operation list.
                                        const entry = prev.findIndex(item => item.id === downloadContent.operationId);
                                        if (entry !== -1) prev.splice(entry, 1);
                                        return [...prev];
                                    })
                                } catch (ex) {
                                    videoObject.controls = true;
                                    !createNewVideoElement && updateVideoControlsDisabled(false);
                                    isLocalVideoObject && videoObject.remove();
                                }
                            }}>{lang("Export frames")}</ImageButton>
                        </div>}

                    </Card><br></br>
                    <Card secondLevel={true}>
                        <h2>{lang("Export options:")}</h2>
                        <label className="flex hcenter">
                            {lang("Output format:")}
                            <select disabled={areVideoControlsDisabled} defaultValue={videoExportOptions.current.outputFormat} onChange={e => (videoExportOptions.current.outputFormat = e.target.value as "jpeg")}>
                                <option value={"jpeg"}>JPEG</option>
                                <option value={"png"}>PNG</option>
                                {document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp") && <option value={"webp"}>WebP</option>}
                            </select>
                        </label><br></br>
                        <label>
                            {lang("Image quality (irrelevant for PNG files):")}
                            <input disabled={areVideoControlsDisabled} defaultValue={videoExportOptions.current.quality} onChange={e => (videoExportOptions.current.quality = +e.target.value)} type="range" min={0} max={1} step={0.01}></input>
                        </label><br></br>
                        <label className="flex hcenter gap">
                            <input type="checkbox" disabled={areVideoControlsDisabled}  defaultChecked={videoSensitiveExportOptions.resizeImage} onChange={(e) => updateVideoSensitiveExportOptions(prev => {return {...prev, resizeImage: e.target.checked}})}></input>
                            {lang("Resize the output image")}
                        </label><br></br>
                        {videoSensitiveExportOptions.resizeImage && <Card>
                        <h4>{lang("Resize options:")}</h4>
                        <select disabled={areVideoControlsDisabled}  defaultValue={videoSensitiveExportOptions.resizeType} onChange={(e) => updateVideoSensitiveExportOptions(prev => {return {...prev, resizeType: e.target.value as "percentage"}})}>
                            <option value={"percentage"}>{lang("Resize in percentage")}</option>
                            <option value={"width"}>{lang("Set a fixed width")}</option>
                            <option value={"height"}>{lang("Set a fixed height")}</option>
                        </select><br></br><br></br>
                        {videoSensitiveExportOptions.resizeType === "percentage" ? <label>
                            {lang("Output image width/height:")} <input disabled={areVideoControlsDisabled}  type="range" min={0} max={1} step={0.01} defaultValue={videoExportOptions.current.resizePercentage} onChange={(e) => (videoExportOptions.current.resizePercentage = +e.target.value)}></input>
                        </label> : <label className="flex hcenter gap">
                            {lang(`Output ${videoSensitiveExportOptions.resizeType}`)}: <input disabled={areVideoControlsDisabled}  type="number" defaultValue={videoExportOptions.current.resizeFixed} onChange={(e) => (videoExportOptions.current.resizeFixed = +e.target.value)}></input></label>}
                        </Card>}
                    </Card>
                </div>
            </div>
        </Card>
        <OperationTracker status={operationList}></OperationTracker>
    </>
}