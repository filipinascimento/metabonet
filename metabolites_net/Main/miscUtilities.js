/* global d3 saveAs d3_save_svg xnet */

"use strict";


async function readNetworkFile(networkFile){
	let networkData = await d3.text(networkFile);
	// console.log(networkData);
	return xnet.load(networkData);
}


let myRequestAnimationFrame = (function () {
	return window.requestAnimationFrame ||
		window.webkitRequestAnimationFrame ||
		window.mozRequestAnimationFrame ||
		window.oRequestAnimationFrame ||
		window.msRequestAnimationFrame ||
		function ( /* function FrameRequestCallback */ callback, /* DOMElement Element */ element) {
			return window.setTimeout(callback, 1000 / 60);
		};
})();


function someJiggle() {
	return (Math.random() - 0.5) * 1e-6;
}


let myCancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame;


// async function startVisualization(){
// 	let visualizer = new TimelineVisualizer(await readData());
// 	console.log(visualizer);
// 	visualizer.start();
// }

// startVisualization();


function getTransformForLine(x1,y1,x2,y2) {
	let dx = (x2-x1);
	let dy = (y2-y1);
	let vectorLength = Math.sqrt(dx*dx + dy*dy);
	let scale = vectorLength;
	let angle = Math.atan2(dy, dx) * 180 / Math.PI;
	// scale = 2;
	// angle = 10;
	return `translate(${x1},${y1}) scale(${scale}) rotate(${angle-45}) `;
}
function getStrokeCorrectionForLine(x1,y1,x2,y2) {
	let dx = (x2-x1);
	let dy = (y2-y1);
	let vectorLength = Math.sqrt(dx*dx + dy*dy);
	let scale = vectorLength;
	// scale = 2;
	// angle = 10;
	return scale;
}

function createWebGLContext(canvas, opt_attribs) {
	var names = ["webgl", "experimental-webgl", "webkit-3d", "moz-webgl"];
	var context = null;
	for (var ii = 0; ii < names.length; ++ii) {
		try {
			context = canvas.getContext(names[ii], opt_attribs);
		} catch(e) {}
		if (context) {
			break;
		}
	}
	return context;
};



function sortByFrequency(array) {
	var frequency = {};

	array.forEach(function(value) { frequency[value] = 0; });

	var uniques = array.filter(function(value) {
			return ++frequency[value] == 1;
	});

	return uniques.sort(function(a, b) {
			return frequency[b] - frequency[a];
	});
}


