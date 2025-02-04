import React, { useMemo, useCallback, forwardRef } from 'react';
import Draggable from 'react-draggable';
import { ResizableBox } from 'react-resizable';
import Window from './Window';
import { useWindowData } from './includes/WindowContext';

const WindowBorder = React.memo(({
	windowId,
	title, // Pass title down to Window
	onMinimize,
	onMaximize,
	onClose,
	onClick,
	onContextMenu,
	minimised,
	maximised,
	initialPosition,
	zIndex,
	appData,
	icon,
	isActiveWindow,
	children,
	embedable,
	inContainer,
	metadata,
	windowA
}) => {

	const { getWindowContent } = useWindowData();
	const content = getWindowContent(windowId);
	const { license, embedMode } = appData;

	const windowIcon = icon || content?.icon || '🖼️';
		

	const MyHandle = useMemo(() => forwardRef((props, ref) => {
		const { handleAxis, ...restProps } = props;
		return <div ref={ref} className={`handle handle-${handleAxis}`} {...restProps} />;
	}), []);

	const handleStart = useCallback((e, data) => {
		console.log('handleStart');
		e.stopPropagation();
	}, []);

	if(embedMode && inContainer) {
		if(isActiveWindow) {
			maximised = true;
		}else{
			minimised = true;
		}

	}
	if (minimised) {
		return null;
	}


	if (maximised) {
		return (
			<div className='maximised' style={{ zIndex: zIndex, display: 'flex', position: 'relative' }}>
				<div className="window-border" style={{ flexGrow: 1 }}>
					<Window
						title={title}
						onMinimize={onMinimize}
						onMaximize={onMaximize}
						onClose={onClose}
						onContextMenu={onContextMenu}
						maximised={maximised}
						onClick={onClick}
						appData={appData}
						icon={windowIcon}
						isActiveWindow={isActiveWindow}
						embedable={embedable}
						embeded={embedMode && inContainer}
						metadata={metadata}
						windowA={windowA}
					>
						{children} {/* Additional content */}
					</Window>
				</div>
			</div>
		);
	}

	if (!initialPosition || !initialPosition.width || !initialPosition.height) {
		initialPosition = {
			x: (window.innerWidth < 600) ? 0 : (5 + zIndex * 5),
			y: (window.innerWidth < 600) ? 0 : (5 + zIndex * 5),
			width: 350,
			height: 400
		};
	}

	if (initialPosition.x === 'auto') {
		const windows = document.querySelectorAll('.window-border');
		let count = 0;
		windows.forEach(window => {
			if (window.querySelector('.title-text').textContent === title) {
				count++;
			}
		});

		if (count === 0) {
			initialPosition.x = 0;
			initialPosition.y = 0;
		} else {
			const lastWindow = windows[windows.length - 1];
			const lastWindowRect = lastWindow.getBoundingClientRect();
			const windowRect = lastWindow.parentElement.getBoundingClientRect();
			if (lastWindowRect.right + initialPosition.width < window.innerWidth) {
				initialPosition.x = lastWindowRect.right;
				initialPosition.y = lastWindowRect.top - windowRect.top;
			} else {
				initialPosition.x = 0;
				initialPosition.y = lastWindowRect.top + 50;
			}
		}
	}

	return (
		<Draggable
			handle={"div>span>div>div.title>div.title-text"}
			defaultPosition={{ x: initialPosition.x, y: initialPosition.y }}
			bounds="parent"
			onStart={handleStart}
			enableUserSelectHack={false}
			cancel='.search-text-box'
		>
			<div className={'window-border' + (license? ' win95':'')} style={{ zIndex: zIndex, 'width': 'fit-content' }}>
				<ResizableBox
					width={initialPosition.width}
					height={initialPosition.height}
					axis='both'
					minConstraints={[200, 200]}
					resizeHandles={['se', 'ne', 'nw', 'sw']}
					handle={<MyHandle />}
				>
					<span style={{ width: '100%', height: '100%' }} onMouseDown={onClick}>
						<Window
							title={title}
							onMinimize={onMinimize}
							onMaximize={onMaximize}
							onClose={onClose}
							onContextMenu={onContextMenu}
							maximised={maximised}
							icon={windowIcon}

							appData={appData}
							isActiveWindow={isActiveWindow}
							embedable={embedable}
							embeded={embedMode && inContainer}
							metadata={metadata}
							windowA={windowA}
						>
							{children} {/* Additional content */}
						</Window>

						<div className="bottomright handle react-resizable-handle-se"></div>
						<div className="topright handle react-resizable-handle-ne"></div>
						<div className="topleft handle react-resizable-handle-nw"></div>
						<div className="bottomleft handle react-resizable-handle-sw"></div>
					</span>
				</ResizableBox>
			</div>
		</Draggable>
	);
});

export default WindowBorder;
