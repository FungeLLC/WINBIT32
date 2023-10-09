import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));

//random number between 0 and 9 inclusive
const rdm = Math.floor(Math.random() * 10).toString();



root.render(
  <>

    <div
      className="loading_overlay"
      id="loading_overlay"
      onClick={() => {
        document.getElementById("loading_overlay").style.display = "none";
      }}
    >
      <div>Loading...</div>
      <div><img src={process.env.PUBLIC_URL + "/bglogos/logo"+ rdm  +".png"} alt="logo" /></div>
      
      
    </div>
    <App />
  </>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
