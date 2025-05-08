import { toast } from "react-hot-toast";
import { QRCodeSVG } from 'qrcode.react';


export const copyToClipboard = (text) => {
	console.log("copyToClipboard", text);
	navigator.clipboard.writeText(text).then(() => {
		//put conformatoin after element
		//'Address copied to clipboard!';

		//put confirmation in a toast
		// toast.success('Address copied to clipboard!');

		toast((t) => (
			<span
				onClick={() => toast.dismiss(t.id)}
				data-tid={t.id}
				className="toastText">
				Address copied to clipboard!
			</span>
		));

		//add onclick listener to toast that dismisses it

		document.addEventListener("click", (e) => {
			//if somewhere in the children of clicked element has class toastText, dismiss the toast
			if (e.target.querySelector(".toastText")) {
				toast.dismiss(
					e.target.querySelector(".toastText").getAttribute("data-tid")
				);
			}
		});
	});
};


export const qrToast = (text) => {
	toast((t) => {
		t.duration = 120000;

		return <span
			onClick={() => toast.dismiss(t.id)}
			data-tid={t.id}
			className="toastText">
			<QRCodeSVG value={text} size={186} />

		</span>
});

	document.addEventListener("click", (e) => {
		//if somewhere in the children of clicked element has class toastText, dismiss the toast
		if (e.target.querySelector(".toastText")) {
			toast.dismiss(
				e.target.querySelector(".toastText").getAttribute("data-tid")
			);
		}
	});
}
