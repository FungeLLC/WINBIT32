import React from 'react';
import { useMemo, useCallback, useEffect, useState } from 'react';
import DialogBox from '../win/DialogBox';

const ProgramGroup = ({ params, programs, parentOnOpenWindow, onMenuAction, windowA, handleExit, subPrograms }) => {

	if(!subPrograms) return null;
	if(subPrograms.find(p => p.progName === 'winbit32.exe')) {

		// var event = new MouseEvent('mouseover', {
		// 	'view': window,
		// 	'bubbles': true,
		// 	'cancelable': true
		// });
			


		// element.dispatchEvent(event);
			//after 3 seconds, dispatch a mouseover event

		setTimeout(function() {

			var element = document.querySelector('.icon_winbit32');
			if(!element) return;
			
			var event = new MouseEvent('mouseover', {
				'view': window,
				'bubbles': true,
				'cancelable': true
			});
			element.dispatchEvent(event);

			//flash it too, set background to tooltip yellow, then back to white, with fade in/out, twice
			element.style.transition = 'background-color 0.2s';
			element.style.backgroundColor = '#FFFF66';
			setTimeout(function() {
				element.style.transition = 'background-color 0.8s';
				element.style.backgroundColor = 'white';
			}, 1000);
			setTimeout(function() {
				element.style.transition = 'background-color 0.2s';
				element.style.backgroundColor = '#FFFF66';
			}, 2000);
			setTimeout(function() {
				element.style.transition = 'background-color 0.8s';
				element.style.backgroundColor = 'white';
			}, 3000);
			



		}

		, 3000);
	}




	return (
		<>
			<div className="program-manager" style={{ display: 'flex', flexWrap: 'wrap' }}>
				{/* Map through programs and display an icon for each, filtering out progID == 0 */}
				{subPrograms.filter(program => program.progID !== 0 && program.menuOnly !== true).map((program, index) => (
					<div
						key={index}
						className={"program-icon icon_" + program.progName.split('.')[0]}
						style={{ width: '95px', padding: '10px', textAlign: 'center' }}
						onClick={() => parentOnOpenWindow(program, {}, true)} // Handle icon click to open a window
						title={program.tooltip}
					>
						<div style={{ fontSize: '2em' }}>{program.icon}</div> {/* Display the icon */}
						<div style={{ marginTop: '5px' }}>{program.title}</div> {/* Display the program name */}
					</div>
				))}
			</div>
		</>
	);
};




export default ProgramGroup;
