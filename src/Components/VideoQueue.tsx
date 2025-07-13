import { useEffect, useRef, useState } from "react"
import GetIcons from "../Scripts/Icons";
import Card from "./Card";
import type { QueueProp, VideoQueueStorage } from "../Scripts/Interface";
import ZipOptionsCallback from "./ZipOptionsCallback";
import DownloadContent from "../Scripts/DownloadContent";
import ImageButton from "./ImageButton";
import { lang } from "../Scripts/Translations";


interface Props {
    /**
     * The list of images in the exportation list
     */
    queueFiles: VideoQueueStorage[],
    /**
     * The callback to update the exportation list state
     */
    updateQueueFiles: React.Dispatch<React.SetStateAction<VideoQueueStorage[]>>,
    /**
     * The function to call so that the main video will play from that specific frame
     * @param time the timestamp in seconds of the clicked frame
     */
    callback: (time: number) => void,
    /**
     * The File that is being used
     */
    video: File,
    /**
     * The function to update the operation list state, so that the user can track the progress of this zip file.
     */
    updateOperationList: React.Dispatch<React.SetStateAction<QueueProp[]>>
}

/**
 * A button that, if clicked, shows the list of all the frames that have been added to the exportation list.
 * @returns the VideoQueue ReactNode
 */
export default function VideoQueue({ queueFiles, callback, video, updateQueueFiles, updateOperationList }: Props) {
    const [isVideoQueueOpened, openVideoQueue] = useState<boolean>(false);
    const [isDownloadInProgress, updateDownload] = useState<boolean>(false);
    /**
     * If, at the end of the download, all the images should be removed from the exportation list
     */
    const removeImageQueue = useRef(true);
    const dialogRef = useRef<HTMLDivElement>(null);
    const tableDiv = useRef<HTMLDivElement>(null);
    /**
     * The settings to download the
     */
    const downloadDiv = useRef<HTMLDivElement>(null);

    async function closeDialog() {
        if (dialogRef.current) {
            await opacityFadeOutTransition(dialogRef.current)
            openVideoQueue(false);
            updateDownload(false);
        }
    }
    async function opacityFadeOutTransition(item: HTMLElement) {
        item.style.opacity = "0";
        await new Promise(res => setTimeout(res, 210));
    }
    async function opacityFadeInTransition(item: HTMLElement) {
        setTimeout(() => item.style.opacity = "1", 25)
    }
    const [zipFileOptions, updateZipFileOptions] = useState({
        downloadType: "zip",
        useServiceWorker: true
    });
    const [optionsDisabled, updateOptionsDisabled] = useState(false);
    useEffect(() => {
        isVideoQueueOpened && dialogRef.current && opacityFadeInTransition(dialogRef.current);
    }, [isVideoQueueOpened]);
    useEffect(() => {
        isDownloadInProgress && downloadDiv.current && opacityFadeInTransition(downloadDiv.current);
    }, [isDownloadInProgress])
    return <>
        <ImageButton img="imageMultiple" onClick={() => openVideoQueue(true)}>
            {lang("View frames list")}
        </ImageButton>
        {isVideoQueueOpened && <>
            <div className="dialog" ref={dialogRef}>
                <Card>
                    <div style={{ height: "100%", overflow: "auto" }}>
                        <h2>{lang("Frames list:")}</h2>
                        <div className="flex gap mainFlex mainMiniFlex">
                            {!isDownloadInProgress && <ImageButton img="download" onClick={async () => {
                                if (tableDiv.current) await opacityFadeOutTransition(tableDiv.current);
                                updateDownload(true);
                            }}>{lang("Download everything")}</ImageButton>}
                            <ImageButton img="dismiss" onClick={() => closeDialog()}>Close</ImageButton>
                        </div><br></br>
                        {isDownloadInProgress ? <div ref={downloadDiv}>
                            <Card secondLevel={true}>
                                <h3>{lang("Download settings:")}</h3>
                                <ZipOptionsCallback disabled={optionsDisabled} callback={(callback) => {
                                    updateZipFileOptions(prev => { return { ...prev, ...callback } });
                                }}></ZipOptionsCallback><br></br>
                                <label className="flex hcenter gap">
                                    <input type="checkbox" defaultChecked={removeImageQueue.current} onChange={(e) => (removeImageQueue.current = e.target.checked)}></input>
                                    {lang("Remove images from list after download")}
                                </label>
                            </Card>
                            <br></br>
                            <ImageButton disabled={optionsDisabled} img="download" onClick={async (e) => {
                                updateOptionsDisabled(true);
                                const zipFileName = `${video.name.substring(0, video.name.lastIndexOf("."))} - Queue [${Date.now()}].zip`;
                                const zipOptions = { ...zipFileOptions };
                                const zipDownload = new DownloadContent(zipOptions.downloadType === "zip" ? zipOptions.useServiceWorker ? "zipstream" : "zipblob" : zipOptions.downloadType === "share" ? "share" : "link", zipFileName);
                                updateOperationList(prev => [...prev, { // Add the current download to the operation list
                                    id: zipDownload.operationId,
                                    description: lang(`Downloading frame list`),
                                    max: queueFiles.length,
                                    progress: 0
                                }])
                                for (const file of queueFiles) {
                                    await zipDownload.downloadFile({ filename: file.name, content: file.blob }); // Download the file, or add it to the zip file
                                    updateOperationList(prev => { // Update the operation progress
                                        const entry = prev.findIndex(item => item.id === zipDownload.operationId);
                                        prev[entry].progress++;
                                        return [...prev];
                                    });
                                }
                                await zipDownload.releaseFile(zipFileName); // Download the zip file if requested by the user
                                removeImageQueue.current && updateQueueFiles([]); // Remove the images frmo the list
                                updateOptionsDisabled(false);
                                updateOperationList(prev => { // Delete the current operation from the list
                                    const entry = prev.findIndex(item => item.id === zipDownload.operationId);
                                    prev.splice(entry, 1);
                                    return [...prev];
                                })
                                await closeDialog();
                            }}>{lang("Download list")}</ImageButton>
                        </div> : <div className="opacity" ref={tableDiv}>
                            <p>{lang("Click on an image to delete it, on its file name to download it or on its timestamp to go to that frame.")}</p>
                            <div>
                                <table>
                                    <thead>
                                        <tr>
                                            <th>{lang("Image:")}</th>
                                            <th>{lang("File name:")}</th>
                                            <th>{lang("Timestamp:")}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {queueFiles.map((item, i) => {
                                            const objectUrl = URL.createObjectURL(item.blob);
                                            return <tr key={`PreviewImage-${item.name}`}>
                                                <td>
                                                    <img onClick={() => updateQueueFiles(prev => { // Delete this image
                                                        prev.splice(i, 1);
                                                        return [...prev];
                                                    })} className="previewImg" src={objectUrl} loading="lazy"></img>
                                                </td>
                                                <td>
                                                    <a href={objectUrl} target="_blank" download={item.name}>{item.name}</a>
                                                </td>
                                                <td>
                                                    <span style={{ textDecoration: "underline" }} onClick={async () => {
                                                        await closeDialog();
                                                        callback(item.duration)
                                                    }}>{item.duration}</span>
                                                </td>
                                            </tr>
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>}
                    </div>
                </Card>
            </div>
        </>}
    </>
}