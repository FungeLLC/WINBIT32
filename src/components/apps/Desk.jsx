import React, { Component } from 'react';
import WindowManager from '../win/WindowManager';
import { getPrograms } from '../win/programs';

const Desk = ({ onStateChange }) => {

	// Filter out "Desk" itself to avoid recursion
	const filteredPrograms = getPrograms().filter((p) => p.progName !== 'desk.exe');

	console.log(filteredPrograms);

	return (
		<div className="desk">
			<WindowManager programs={filteredPrograms} windowName={'desk'} onStateChange={onStateChange} />
		</div>
	);
};

export default Desk;