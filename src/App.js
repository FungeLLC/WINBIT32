import React, { useState, useEffect, useRef } from "react";
import QRpop from "./qrpop";
import DOSPrompt from "./components/win/DOSPrompt";
import WelcomeWarning from "./components/WelcomeWarning";
import { getPrograms } from "./components/win/programs";
import WindowManager from "./components/win/WindowManager";
import { WindowDataProvider } from "./components/win/includes/WindowContext";
import { SKClientProviderManager } from "./components/contexts/SKClientProviderManager";
import { Toaster } from "react-hot-toast";
import { StateSetterProvider } from "./components/contexts/SetterContext";
import "./styles/win95.css";
import { AssetValue } from "@swapkit/helpers";
import Matrix from "./components/win/Matrix";

const programs = getPrograms();

const App = () => {
	const [qrResult, setQrResult] = useState(null);
	const [showQRPop, setShowQRPop] = useState(false);
	const [showDOSPrompt, setShowDOSPrompt] = useState(false);
	const [minimizedWindows, setMinimizedWindows] = useState([]);
	const [windowHistory, setWindowHistory] = useState([]);
	const [windows, setWindows] = useState([]);
	const [contextMenuVisible, setContextMenuVisible] = useState(false);
	const [contextMenuPosition, setContextMenuPosition] = useState({
		x: 0,
		y: 0,
	});
	const [highestZIndex, setHighestZIndex] = useState(1);
	const [loaded, setLoaded] = useState(false);
	const [license, setLicense] = useState(false);
	const [appData, setAppData] = useState({});
	const [showMatrix, setShowMatrix] = useState(false);

	const hashPathRef = useRef(null);

	console.log('window', window);

	AssetValue.loadStaticAssets();

					// }

	const handleExit = () => {
		setShowDOSPrompt(true);
	};

	const setStateAndSave = (newState) => {
		setQrResult(newState.qrResult || qrResult);
		setShowQRPop(newState.showQRPop || showQRPop);
		setShowDOSPrompt(newState.showDOSPrompt || showDOSPrompt);
		setMinimizedWindows(newState.minimizedWindows || minimizedWindows);
		setWindowHistory(newState.windowHistory || windowHistory);
		setWindows(newState.windows || windows);
		setContextMenuVisible(newState.contextMenuVisible || contextMenuVisible);
		setContextMenuPosition(newState.contextMenuPosition || contextMenuPosition);
		setHighestZIndex(newState.highestZIndex || highestZIndex);
		setLicense(newState.license || license);
	};

	const toggleQRPop = () => {
		setShowQRPop(!showQRPop);
	};

	const handleQRRead = (result) => {
		setQrResult(result);
		setShowQRPop(false);
	};

	// const { addProvider } = useSKClientProviderManager();

	// const handleAddProvider = (windowId) => {
	// 	const newKey = `provider-${windowId}`;
	// 	addProvider(newKey);
	// 	return newKey;
	// };
	useEffect(() => {
		// if (windowName === "desktop") {

		//get hash, split by /, if the first one begins ~ then set option with it then remove it
		const hash = window.location.hash;

		if(!hash){
			hashPathRef.current = [];
		}else{
			const hashParts = hash.replace("#", "").split("/");
			console.log("Hash Parts:", hashParts);
			if (hashParts[0].startsWith("~")) {
				const option = hashParts[0].replace("~", "");
				//split by =
				const optionParts = option.split("=");
				const validOptions = ["embedMode"];
				if(optionParts[1] !== "true" && optionParts[1] !== "false"){
					//base64 decode
					optionParts[1] = atob(optionParts[1]);
				}
				if(validOptions.includes(optionParts[0])){
					setAppDataKey(optionParts[0], optionParts[1]);
				}
				hashParts.shift();
				window.history.replaceState(null, null, `#${hashParts.join("/")}`);
			}
			hashPathRef.current = hashParts;
		}
		setTimeout(() => {
			setLoaded(true);
		}, 1500);
	}, []);


	const sendUpHash = (hashParts, windowId) => {
			//reverse hashParts so that the first part is the top level
			const rHashParts = hashParts.slice().reverse();
			//console.log("Got Hash Parts:", hashParts);
			let newHash = hashParts.length ? `#${rHashParts.join("/")}` : "";
			if( newHash === "#progman.exe"){
				newHash = "";
			}
			//console.log("Setting hash to...", newHash);
			if (window.location.hash !== newHash) {
				window.history.replaceState(null, null, newHash);
			}
		};

	const setAppDataKey = (key, value) => {
		setAppData((prev) => {
			return { ...prev, [key]: value };
		}
		);
	};

	useEffect(() => {
		setAppDataKey("setAppDataKey", setAppDataKey);
		setAppDataKey("license", license);
		setAppDataKey("setLicense", setLicense);
		setAppDataKey("setShowMatrix", setShowMatrix);
	}
	, [setAppData, license, setShowMatrix]);


	const { embedMode } = appData || {};


	return (
		<SKClientProviderManager>
			<StateSetterProvider>
				{showQRPop && (
					<QRpop onQRRead={handleQRRead} closeQrPop={toggleQRPop} />
				)}
				{showDOSPrompt ? (
					<DOSPrompt />
				) : (
					<>
						{hashPathRef.current !== null && (
							<div
								style={loaded ? { zIndex: 999 } : { zIndex: 0 }}
								className="full-desktop"
								id="desktop">
								<WindowDataProvider>
									<WindowManager
										programs={programs}
										windowName={"desktop"}
										setStateAndSave={setStateAndSave}
										providerKey={"desktop"}
										handleOpenArray={[]}
										handleExit={handleExit}
										sendUpHash={sendUpHash}
										windowId={"desktop"}
										hashPath={hashPathRef.current}
										appData={appData}
									/>
								</WindowDataProvider>
							</div>
						)}
						{loaded ? (
							!embedMode && (
								<>
									<WelcomeWarning onExit={handleExit} />
								</>
							)
						) : (
							<div
								className="loading_overlay"
								id="loading_overlay"
								onClick={() => {
									setLoaded(true);
									document.getElementById("loading_overlay").style.display =
										"none";
								}}>
								<div>
									<img
										src={process.env.PUBLIC_URL + "/winlogo.png"}
										alt="logo"
									/>
								</div>
							</div>
						)}
					</>
				)}
				<Toaster
					position="bottom-right"
					containerStyle={{
						zIndex: 999000000000000000,
					}}
					toastOptions={{
						// Define default options
						className: "toast",
						duration: 3000,
						style: {
							paddingTop: "20px",
						},
					}}
				/>
				<Matrix show={showMatrix} onHide={() => setShowMatrix(false)} />
			</StateSetterProvider>
		</SKClientProviderManager>
	);
};

export default App;
