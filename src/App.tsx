import { useEffect, useLayoutEffect, useState } from "react";
import Header from "./Components/Header";
import Card from "./Components/Card";
import MainVideoUI from "./Components/MainVideoUI";
import ImageButton from "./Components/ImageButton";
import Settings from "./Components/Settings";
import UpdateTheme from "./Scripts/UpdateTheme";
import { lang, usedBrowserLang } from "./Scripts/Translations";
import { createRoot } from "react-dom/client";
import Alert from "./Components/Alert";
import CreateAlert from "./Scripts/CreateAlert";

declare global {
  interface Window {
    version: string
  }
}

export default function App() {
  const [videoFile, updateVideoFile] = useState<File>();
  useLayoutEffect(() => {
    const customTheme = JSON.parse(localStorage.getItem("VideoFrameExtractor-Theme") ?? "{}");
    for (const key in customTheme) {
      /^#([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/.test(customTheme[key]) && document.body.style.setProperty(`--${key}`, customTheme[key]);
    }
    UpdateTheme();
  }, [])
  useEffect(() => {
    if (usedBrowserLang && !localStorage.getItem("VideoFrameExtractor-ShownCustomLang")) {
      CreateAlert(<span>Applied custom language. You can change it from the {lang("Settings")} ("Settings") link at the end of the page.</span>)
      localStorage.setItem("VideoFrameExtractor-ShownCustomLang", "a");
    } 
  }, [])
  return <>
    <Header restoreEverything={() => updateVideoFile(undefined)}></Header>
    {!videoFile ? <>
      <Card>
        <h2>{lang("Open a file")}</h2>
        <p>{lang("Click on the button below to open a video file. Don't worry, everything will be elaborated locally and nothing will be sent to a server.")}</p>
        <ImageButton img="videoClip" onClick={() => {
          const input = Object.assign(document.createElement("input"), {
            type: "file",
            accept: "video/*",
            onchange: () => {
              input.files && updateVideoFile(input.files[0]);
            }
          });
          input.click();
        }}>{lang("Pick file")}</ImageButton>
      </Card>
    </> : <MainVideoUI key={"MainVideoUI"} video={videoFile} videoBlobUrl={URL.createObjectURL(videoFile)}></MainVideoUI>}
    <br></br><br></br>
    <div className="flex gap" style={{ flexWrap: "wrap" }}>
      <a className="pointer" href="https://github.com/dinoosauro/video-frame-extractor" target="_blank">{lang("View on GitHub")}</a>
      <Settings></Settings>
      <span>{lang("Version")} {window.version}</span>
    </div>
  </>

}