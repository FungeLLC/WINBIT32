import React from 'react';
import { useMemo, useCallback, useEffect, useState } from 'react';
import DialogBox from '../win/DialogBox';
import { useIsolatedState } from '../win/includes/customHooks';
import WindowManager from '../win/WindowManager';

const ProgramManager = ({ params, programs, onOpenWindow, onMenuAction, windowA, handleExit, subPrograms, windowId, windowName,
		setStateAndSave,
	providerKey,
	setWindowMenu,
	programData,
	setProgramData,
	handleOpenArray,
	onWindowDataChange,
	parentOnOpenWindow,
	initialSubWindows,
	...rest
}) => {

	const [showAboutDialog, setShowAboutDialog] = useState(false);

	//const onOpenWindow = params.onOpenWindow;

	//console.log('Programs:', params);
	const menu = useMemo(() => [
		{
			label: 'File',
			submenu: [
				{ label: 'Exit', action: 'exit', menuOrder: 1000 },
				...programs.filter((program) => program.menuOnly === true).map((program) => ({
					label: program.menuLabel,
					fAction: () => onOpenWindow(program,{}, true)
				})),
			],
		},
		{
			label: 'Help',
			submenu: [
				{ label: 'Source Code...', action: 'source', menuOrder: 1000 },
				{ label: 'About', action: 'about', menuOrder: 1000 },
			],
		}
	], []);

	// Handle menu actions (Copy/Paste)
	const handleMenuClick = useCallback((action) => {

		// const currentInput = currentRef.current; // Get the current input from `useRef`

		switch (action) {
			case 'exit':
				handleExit();
				break;
			case 'about':

				setShowAboutDialog(true)
				
				break;
			//https://github.com/Rotwang9000/WINBIT32
			case 'source':
				window.open('https://github.com/Rotwang9000/WINBIT32', '_blank');
				break;
			default:
				console.log(`Unknown action: ${action}`);
				break;
		}
	}, []);

	// Notify parent about the menu structure and click handler
	useEffect(() => {
		if (onMenuAction) {
			onMenuAction(menu, windowA, handleMenuClick); // Pass menu and click handler
		}
	}, []);



	// Filter out "Desk" itself to avoid recursion
	const [currentSubWindows, setCurrentSubWindows] = useIsolatedState(windowId, 'subWindows', subPrograms.filter((p) => p.progName !== 'desk.exe'));
	const [handleSubProgramClick, setHandleSubProgramClick] = useState(() => { });



	const handleSetSubProgramClick = useCallback((handle) => {
		setHandleSubProgramClick(() => handle);
	}, []);

	useEffect(() => {
		setCurrentSubWindows(initialSubWindows);
	}, [initialSubWindows, setCurrentSubWindows]);

	useEffect(() => {
		setCurrentSubWindows(subPrograms.filter((p) => p.progName !== 'desk.exe'));
		console.log('SubPrograms:', subPrograms);
	}, [subPrograms]);

	return (
		<>

				<div className={`sub-window-area-${windowId}`}>
					<WindowManager
						programs={currentSubWindows}
						windowName={`sub-window-area-${windowName}`}
						onStateChange={onWindowDataChange}
						handleOpenFunction={handleSetSubProgramClick}
						setStateAndSave={setStateAndSave}
						providerKey={providerKey}
						setWindowMenu={setWindowMenu}
						programData={programData}
						setProgramData={setProgramData}
						handleOpenArray={handleOpenArray}
						onOpenWindow={onOpenWindow}
						windowA={windowA}
						{...rest}
					/>
				</div>

		{showAboutDialog &&
				<DialogBox title="About Winbit32" buttons={[{ label: 'OK', onClick: ()=>setShowAboutDialog(false) }]} onConfirm={() => {
			setShowAboutDialog(false);
		}} onCancel={() => {}} onClose={() => {}} showMinMax={false}>
			<div style={{ textAlign: 'center', marginBottom: '10px', display: 'flex', flexDirection: 'column' }}>
						<img src="/sheildlogobsml.png" alt="Winbit32" style={{marginLeft: '50px', marginRight: '50px', marginTop: '20px' }} />
					<div style={{ fontSize: '1.5em', fontWeight: 'bold' }}>Winbit32</div>
					<div>version {require('../../../package.json').version || "0.0.0"}</div>
				<div>
						<a href="https://x.com/WinBit32" target="_blank" rel="noreferrer">Goto X Profile</a></div>
						</div>
		</DialogBox>
		}
		</>
	);
};

export default ProgramManager;
