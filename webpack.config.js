import { URL } from "url";
import webpack from "webpack";

const config = {
	mode: process.env.NODE_ENV || "development",
	entry: "./index.js",
	module: {
		rules: [
			{
				test: /\.(js|jsx|.ts)$/,
				exclude: /node_modules/,
				use: {
					loader: "babel-loader",
					options: {
						presets: ["@babel/preset-react"],
						plugins: ['@babel/plugin-transform-classes'],
					},
				},
			},
		],
	},
	output: {
		filename: "bundle.js",
		path: new URL("dist", import.meta.url).pathname,
	},
	devServer: {
		static: new URL("dist", import.meta.url).pathname,
	},


};

export default config;

const rdm = Math.floor(Math.random() * 10).toString();
window.global = {
    rdm: rdm,
};
