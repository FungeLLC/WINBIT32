import React, { useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import TitleBar from './TitleBar';
import Draggable from 'react-draggable'; // For draggable dialogs
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleExclamation, faCircleInfo, faCircleQuestion } from '@fortawesome/free-solid-svg-icons';

const DialogBox = React.memo(({
	title = 'Dialog',
	content,
	modal = true,
	icon = '', // Can be 'info', 'question', 'exclamation', etc.
	buttons = [], // Custom button configuration
	buttonClass = '', // Optional class for buttons
	dialogClass = '', // Optional class for dialog
	onConfirm = () => { },
	onCancel = () => { },
	onClose = () => { }, // Handle close action
	showMinMax = false, // Optional minimize and maximize buttons
	children
}) => {
	const icons = {
		info: <FontAwesomeIcon icon={faCircleInfo} style={{ color: 'blue' }} />,
		question: <FontAwesomeIcon icon={faCircleQuestion} style={{ color: 'blue' }} />,
		questionok: <FontAwesomeIcon icon={faCircleQuestion} style={{ color: 'blue' }} />,
		exclamation: <FontAwesomeIcon icon={faCircleExclamation} style={{ color: 'red' }} />,
		stop: <img src='stop.png' alt='stop' />,
		key: <img src='/images/safe.png' alt='key' style={{ width: '64px', height: '64px' }} />
	};

	const iconSymbol = (icon && icons[icon]) ? <div className="icon">{icons[icon]}</div> : null;

	const handleStart = (e, data) => {
		console.log('Start', data.x, data.y);
		e.stopPropagation();
	};

	if (!content) {
		content = children;
	} else {
		content = <div className='message'>{content}</div>;
	}

	// Create a div that will be used as the portal container
	const portalContainer = useRef(document.createElement('div'));
	portalContainer.current.id = 'dialog-portal-container';



	// The dialog box content
	const dialogContent = (
		<div className={`dialog-wrapper ${modal ? 'modal' : ''}`}>
			{modal && <div className="dialog-backdrop" onClick={onCancel} />} {/* Dimming background */}
			<Draggable handle={"div div.title>div.title-text"} defaultPosition={{ x: 0, y: 0 }} positionOffset={{ x: '-51%', y: '-55%' }} onStart={handleStart} cancel='.search-text-box' disabled={true}
				onKeyDown={(e) => {
					if (e.key === 'Escape') {
						onClose();
					}
					if(e.key === 'Enter'){
						onConfirm();
					}
				}}
			>
				<div className='dialog-border'>
					<TitleBar
						title={title}
						onClose={onClose} // Handle close action
						showMinMax={showMinMax} // Optional minimize/maximize buttons
					/>
					<div className={`dialog-box ${dialogClass}`}>
						<div className="content">
							{iconSymbol} {/* Display the appropriate icon */}
							{content}
						</div>
						<div className={'dialog-buttons ' + buttonClass}>
							{buttons.length > 0 ? (
								buttons.map((btn, idx) => (
									btn &&
									<button key={idx} onClick={btn.onClick || btn.onclick}>
										{btn.label}
									</button>
								))
							) : (
								<>
									{icon === 'question' || icon === 'stop' ? (
										<>
											<button onClick={onConfirm}>Yes</button>
											<button onClick={onCancel}>No</button>
										</>
									) : (
										<>
											<button onClick={onConfirm}>OK</button>
											<button onClick={onCancel}>Cancel</button>
										</>
									)}
								</>
							)}
						</div>
					</div>
					{/* Resizing handles */}
					<div className="bottomright handle"></div>
					<div className="topright handle"></div>
					<div className="topleft handle"></div>
					<div className="bottomleft handle"></div>
				</div>
			</Draggable>
		</div>
	);

	useEffect(() => {

		//detect Enter keypress on all inputs and trigger the OK button
			const handleKeyPress = (e) => {
				if (e.key === 'Enter') {
					onConfirm();
				}
			};
			//add to inputs in this specific dialog by reference
			const inputs = portalContainer.current.getElementsByTagName('input');
			for (let i = 0; i < inputs.length; i++) {
				inputs[i].addEventListener('keypress', handleKeyPress);
			}

			return () => {
				//remove event listeners
				for (let i = 0; i < inputs.length; i++) {
					inputs[i].removeEventListener('keypress', handleKeyPress);
				}
			}
			

		}, [onConfirm]);
		
		useEffect(() => {
	

		const inputs = portalContainer.current.getElementsByTagName('input');

		//set focus to first input after it is mounted and rendered
		if (inputs.length > 0) {
			inputs[0].componentDidMount = () => {
				inputs[0].focus();
				
			}
		}

		// Append the portal container to the body
		document.body.appendChild(portalContainer.current);
		return () => {
			// Cleanup the portal container when the component unmounts
			document.body.removeChild(portalContainer.current);
		};
	}, []);

	// Render the dialog box into the portal container
	return ReactDOM.createPortal(dialogContent, portalContainer.current);
});

export default DialogBox;
