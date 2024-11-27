import React, { useState } from 'react';
import DialogBox from './win/DialogBox';

const WelcomeWarning = ({ onExit }) => {
	const [showDialog, setShowDialog] = useState(true);

	const handleConfirm = () => {
		console.log("Confirmed");
		setShowDialog(false); // Hide the dialog
	};

	const handleCancel = () => {
		console.log("Cancelled");
		setShowDialog(false); // Hide the dialog
		onExit(); // Notify parent to "exit"
	};

	const dialogContent = (
		<div className='welcome-warning'>
			<p>This site is just a tool, no Warranty given or implied.</p>
			<p>This site <b>Does not</b> use cookies. It will <b>not</b> remember you.</p>
			<p>No Secure information is sent to a server or leaves your browser</p>
			<p>It <b>will</b> let you do stupid things that will lose money.</p>
			<p>Your private key, phrase, or QR code is the only way to access funds.</p>
			<p>Lose it, and you <b>will lose your money.</b></p>
			<p>Give it to someone else, and they <b>will steal your money.</b></p>
			<p>Our support will never ask for it and cannot provide it.<br />Reload and it will be gone.</p>
			<p>Do you agree to take responsibility for yourself?</p>
		</div>
	);

	const buttons = [
		{ label: 'Yes', onClick: handleConfirm },
		{ label: 'No', onClick: handleCancel },
	]; // Configure the dialog buttons

	return (
		<div>
			{showDialog && (
				<DialogBox
					title="Windows Setup"
					content={dialogContent}
					modal={true} // To dim the background
					icon="stop" // Icon type
					buttons={buttons} // Custom button configuration
					dialogClass="welcome-dialog"
				/>
			)}
		</div>
	);
};

export default WelcomeWarning;
