import React, { useCallback, useState, useMemo, useEffect } from 'react';
import DialogBox from './DialogBox';
import { createRoot } from 'react-dom';
import { copyToClipboard, qrToast } from './includes/utils';
import { FaCopy, FaQrcode } from 'react-icons/fa';
import { format } from 'mathjs';

const TitleBar = ({
	title = "Program Manager",
	showMinMax = true,
	onContextMenu,
	onMinimize,
	onMaximize,
	onClose,
	isMaximized,
	onClick,
	appData,
	icon,
	isActiveWindow,
	embedable,
	embeded,
	metadata,
	windowA,
	...rest
}) => {
	// console.log('TitleBar', title, appData, rest);
	const handleMaximize = useCallback(() => {
		if (onMaximize) {
			onMaximize(!isMaximized);
		}
	}, [isMaximized, onMaximize]);

	const { license, setAppDataKey, embedMode } = appData || {};

	const handleContextMenu = useCallback((e) => {
		const rect = e.target.getBoundingClientRect();
		const position = { x: rect.left, y: rect.bottom };
		console.log(`Context menu at ${position.x}, ${position.y}`);
		if (onContextMenu) {
			onContextMenu(position);
		}
	}, [onContextMenu]);


	const doSetAppData = useCallback((key, newData) => {
		if (!setAppDataKey) return;
		setAppDataKey(key, newData);
	}, [setAppDataKey]);
	const [shareOptions, setShareOptions] = useState();
	const [shareProgOptions, setShareProgOptions] = useState({});
	const [showDialog, setShowDialog] = useState(false);

	const shareProgOptionsOptions = {
		'exchange.exe': [
			{ title: 'Thorchain affiliate Address', key: 'tcName', hint: 'Your Thorname, without the .thor', value: 'be', pattern: "[A-Za-z0-9]{5}" },
			{ title: 'Maya affiliate Address', key: 'mayaName', hint: 'Must be valid and registered.', value: 'be', pattern: "[A-Za-z0-9]{4}" }
		]
	};


	//Pop up a dialog box with the share options - use the window hash, split by /, if the last one has & then split by & give checkboxes for each
	//also an embed option if the window is embedable, which will give a text box with the embed code for the window in an iframe
	const share = useCallback(() => {
		// console.log('share', appData);
		const { hash } = window.location;
		const hashParts = hash.replace('#', '').split('/');
		const shareParts = hashParts[hashParts.length - 1].split('&');
		// console.log(shareParts);
		const oShareOptions = shareParts.map((part) => {
			if (!part) return null;

			const [key, value] = part.split('=');
			return { key, value, checked: true };
		});

		let progOptions = {};
		//go through all hashParts and find any .exe then add any program specific options
		hashParts.forEach((part, index) => {
			if (part.endsWith('.exe') && shareProgOptionsOptions[part]) {
				progOptions[part] = shareProgOptionsOptions[part];
			}
		});

		console.log('progOptions', progOptions);

		setShareProgOptions(progOptions);
		setShareOptions(oShareOptions);
		//dymamic share URL, based on the current window hash and the checcked share options
		setShowDialog(true);

	}
		, [shareProgOptionsOptions, appData]);


	const shareHash = useMemo(() => {
		if (!shareOptions) return '';
		const hashParts = window.location.hash.replace('#', '').split('/');
		const shareParts = hashParts[hashParts.length - 1].split('&');
		const newShareParts = shareParts.map((part, index) => {
			if (shareOptions[index] && shareOptions[index].checked) {
				return part;
			}
			return null;
		});
		let newHashParts = hashParts.slice(0, hashParts.length - 1);
		newHashParts.forEach((part, index) => {
			let pOpts = {};
			if (!part.includes('&') && shareProgOptions[part]) {

				shareProgOptions[part].forEach((progOption, index2) => {
					if (progOption.set) {
						pOpts[progOption.key] = progOption.value;
					}
				});
				if (Object.keys(pOpts).length) {
					//replace part with as base64encoded json added after the .exe and a ~
					newHashParts[index] = part + '~' + btoa(JSON.stringify(pOpts));
				}
			}
		});

		const newShareURL = newHashParts.join('/') + ((hashParts.length > 1) ? '/' : '') + newShareParts.filter((part) => part).join('&');
		return newShareURL;
	}, [shareOptions, shareProgOptions]);

	const siteName = window.location.hostname.includes('winbit')? 'https://WINBIT32.COM': window.location.origin;
	const shareURL = siteName + '/#' + shareHash;
	const embedURL = siteName + '/#~embedMode=true/' + shareHash;
	// console.log(shareOptions);
	const embedCode = `<iframe src="${embedURL}" width="465" height="800" style="border: none;" allow="clipboard-write, camera"></iframe>`;

	const openInNewTab = () => {
		const newTabJson = (metadata.phrase) ? JSON.stringify({ phrase: metadata.phrase }) : '';
		const newTabURL = newTabJson ? window.location.href.replace('winbit32', 'winbit32~' + btoa(newTabJson)) : window.location.href;
		console.log('newTabURL', newTabURL, window.location);
		window.open(newTabURL, '_blank');
	}


	return (
		<>
			<div className={'title ' + (isActiveWindow ? 'activewindow' : 'inactivewindow')}  {...rest} >
				{license ?
					<div onClick={handleContextMenu}
					>{icon}</div> :
					<div
						className="button close contextbutton"
						onClick={handleContextMenu}
					>
						&#8212;
					</div>
				}
				<div className='title-text' onDoubleClick={handleMaximize} onClick={onClick}>
					{title}{license && <> &nbsp; ᛝ</>}{windowA?.titleNote && <>({windowA.titleNote})</>}
				</div>



				{showMinMax && (
					<div className='maxmin' >
						{embedable && <>{!embedMode ? <div style={{float:'right'}}>Share →</div> : ''}<div
							className="button embed"
							onClick={() => {
								if (embedMode) {
									//bust out of embed mode into a new tab
									openInNewTab();
								} else {
									share();
								}
							}
							}
						>
							{!embedMode ? '⛓' : '⧉'}
						</div></>}
						{(!embedable || !embedMode) &&
							<>
								{license ? //Windows 95 style titlebar buttons

									<>

										<div
											className="button min"
											onClick={onMinimize}
										>
											&#128469;&#xFE0E;
										</div>
										<div
											className="button max"
											onClick={handleMaximize}
										>
											{isMaximized ? <>&#128471;&#xFE0E;</> : <>&#128470;&#xFE0E;</>}
										</div>

										<div
											className="button titleclose"
											onClick={onClose}
										>
											&#128473;&#xFE0E;
										</div>
									</>



									:
									<>
										<div
											className="button min"
											onClick={onMinimize}
										>
											▼
										</div>
										<div
											className="button max"
											onClick={handleMaximize}
										>
											{isMaximized ? '⬍' : '▲'}
										</div>
									</>
								}
							</>
						}
					</div>
				)}
			</div>
			{
				showDialog &&
				<DialogBox
					title="Share Options"
					modal={true}
					icon=""
					buttons={[{ label: 'Close', onClick: () => { setShowDialog(false) } }]}
					onClose={() => { setShowDialog(false) }}
					showMinMax={false}
				>
					<div className="share-dialog">
						<div>
							<span>Include<br />Options:</span>
							<div>
								{shareOptions.map((option, index) => (
									option &&
									<div key={index} className="share-option">
										<input type="checkbox" checked={option?.checked} onChange={(e) => {
											const newOptions = [...shareOptions];

											newOptions[index].checked = e.target.checked;
											setShareOptions(newOptions);
											console.log('shareOptions', shareOptions);
										}} />
										{option.key} {option.value && <small>{option.value}</small>}
									</div>
								))}
								{shareProgOptions && Object.keys(shareProgOptions).map((prog, index) => (
									shareProgOptions[prog].map((progOption, index2) => (
										<div key={index2} className="share-program-option">
											<span>{progOption.title}</span>
											<span>
												<div>
											<input type="text" value={progOption.value} onChange={(e) => {
												const newProgOptions = { ...shareProgOptions };
												newProgOptions[prog][index2].value = e.target.value;
												newProgOptions[prog][index2].set = true;
												setShareProgOptions(newProgOptions);
												
													}}
													pattern={progOption.pattern}
													
													/></div>
											{progOption.hint && <div className="hint">{progOption.hint}</div>}</span>
										</div>
									))))
								}

							</div>
						</div>
					<div>
						<span>Share URL:</span>
						<div><span><button onClick={() => copyToClipboard(shareURL)}> <FaCopy /></button> <button onClick={() => qrToast(shareURL)} ><FaQrcode /></button></span><span title={shareURL} className="share-url" onClick={ () => window.open(shareURL, '_blank' )}> <span className="selectable">{shareURL}</span></span></div>
					</div>
					<div>
						<span>Embed Code:</span>
						<textarea value={embedCode} readOnly />
					</div>
				</div>
		</DialogBox>

}
</>
		
	);
};

export default React.memo(TitleBar);
