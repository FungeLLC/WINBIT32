import React from 'react';
import TitleBar from './TitleBar';
import MenuBar from './MenuBar';

const Window = ({ title, onMinimize, onMaximize, onClose, onContextMenu,  maximised, children, onClick,appData, embeded, ...rest }) => {

	let maximisedClass = '';
	if(maximised) {
		maximisedClass = 'maximised';
	}

	const {license, embedMode} = appData;

	return (
		<div className={"window " + maximisedClass + (license? ' win95':'') } 	{...rest}> 
			{/* Pass props to TitleBar, especially if they're required */
			!embeded &&
			<TitleBar
				title={title}
				onContextMenu={onContextMenu}
				onMinimize={onMinimize}
				onMaximize={onMaximize}
				onClose={onClose}
				isMaximized={maximised}
				onClick={onClick}
				appData={appData}
				embedMode={embedMode}
				embedable={rest.embedable}
				windowA={rest.windowA}
				{...rest} />
			}
			{children} {/* Any additional content */}
		</div>
	);
};

export default Window;
