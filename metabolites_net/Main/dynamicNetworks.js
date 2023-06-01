
"use strict";

async function startVisualization() {
	var canvas = d3.select("#networkView").append("canvas");
	var svg = d3.select("#networkView").append("svg").attr("class", "plot");

	let width = 100;
	let height = 100;

	let startIndex = 5;
	let currentNetwork;
	let currentNetworkName;
	let color = d3.scaleOrdinal(d3.schemeCategory10);


	let displayProperties = ["Label"];

	let sizeProperty = "degree";
	let IDProperty = "Label";
	let colorProperty = "Leiden Layered";

	let startYear = 0;
	let endYear = 0;
	let networkName;

	let selectedNodes = new Set();
	let hoverNode = null;
	let useDarkBackground = false;
	let renderLinksSVG = false;
	let renderLinksCanvas = true;
	let renderLinksGL = false;
	let renderGradientLinks = true;

	let dpr = 1.0;
	let zoomScale = 0.9;
	let scaleFactor = 0.0;
	let targetScaleFactor = 1.0;
	let linesIntensity = 0.1;
	let linesWidth = 1.0;
	let maxNodeSize = 10;
	let minNodeSize = 4;
	let sizePowerCoeff = 2.0;

	let maxWidthSize = 4;
	let minWidthSize = 1.5;
	let widthPowerCoeff = 2.0;

	let maxLineOpacity = 0.5;
	let minLineOpacity = 0.05;

	let maxStrength = 8;
	let minStrength = 2;
	let needsUpdate = false;
	let forceStrength = 1.0;

	let xscale = d3.scaleLinear();
	let yscale = d3.scaleLinear();

	let edgesIndices = null;
	let positionArray = null;
	let colorArray = null;
	let indexType = null;
	let edgesBuffer = null;
	let positionsBuffer = null;
	let colorsBuffer = null;
	let intensitiesBuffer = null;
	let edgesShaderProgram = null;


	let currentTransform = null;

	d3.select('#saveSVGButton').on('click', function () {
		var config = {
			filename: currentNetwork.name,
		}
		if (!renderLinksSVG) {
			createSVGLinks();
			updateSVGLinks(100.0);
		}
		let toSaveSVG = d3.select("#networkView").append("svg")
			.classed("plot", true)
			.attr("width", width)
			.attr("height", height)
			.html(d3.select("svg").html());
		d3_save_svg.save(toSaveSVG.node(), config);
		toSaveSVG.remove();

		if (!renderLinksSVG) {
			deleteSVGLinks();
		}
	});

	let gl;
	if (renderLinksGL) {
		gl = createWebGLContext(canvas.node(), { antialias: true, powerPreference: "high-performance", desynchronized: true });
		let edgesShaderVertex = await getShader(gl, "edges-vertex");
		let edgesShaderFragment = await getShader(gl, "edges-fragment");

		edgesShaderProgram = new ShaderProgram(edgesShaderVertex, edgesShaderFragment,
			["linesIntensity"],
			["vertex", "color"],
			gl);
		indexType = gl.UNSIGNED_SHORT;
		edgesBuffer = gl.createBuffer();
		positionsBuffer = gl.createBuffer();
		colorsBuffer = gl.createBuffer();
		intensitiesBuffer = gl.createBuffer();
	}
	window.gl = gl;



	// if(!svgDefs)
	let svgDefs = svg.append('defs');
	let existingDef = new Set();
	let gradient = (colorFrom, colorTo) => {
		colorFrom = d3.rgb(colorFrom).hex();
		colorTo = d3.rgb(colorTo).hex();
		let gradientName = "grad" + colorFrom.replace("#", "") + colorTo.replace("#", "");
		if (!existingDef.has(gradientName)) {
			let mainGradient = svgDefs.append('linearGradient')
				.attr('id', gradientName)
				.attr('x1', "0%")
				.attr('x2', "100%")
				.attr('y1', "0%")
				.attr('y2', "100%");

			mainGradient.append('stop')
				.style("stop-color", colorFrom)
				.attr('offset', '0%');

			mainGradient.append('stop')
				.style("stop-color", colorTo)
				.attr('offset', '100%');

			existingDef.add(gradientName);
		}
		return "url(#" + gradientName + ")";
	};

	let nodes = [];
	let links = [];


	let forceLinks =
		d3.forceLink(links)
			.id(d => d.id);
	forceLinks.strength(d => forceStrength * d.weight / Math.min(d.target.neigh.length, d.source.neigh.length))
	forceLinks.distance(1);

	var simulation = d3.forceSimulation(nodes)
		.force("charge", d3.forceManyBody()
			.strength(d => -((1 - d.sizeFactor) * minStrength + (d.sizeFactor) * maxStrength))
			// .strength(-20)
			// 	// .distanceMin(0.1)
			// 	// .theta(0.5)
		)
		.force("link", forceLinks)
		.force("center", d3.forceCenter(0, 0))
		.force("x", d3.forceX().strength(0.10))
		.force("y", d3.forceY().strength(0.10))
		// .force('collision', d3.forceCollide().radius(d=> d.size*2))
		// .alphaTarget(10)
		.alphaDecay(0.002)
		.velocityDecay(0.6)
		.on("tick", () => { needsUpdate = true; });


	var g = svg.append("g");


	let linksView = g.append("g").attr("stroke", "#000").attr("stroke-width", 1.5).selectAll(".link");


	let nodesView = g.append("g").selectAll(".node");

	let selectedView = g.append("g");
	let selectedLabels = selectedView.selectAll(".nodesSelected");


	let legendView = svg.append("g")
		.classed("legend", true)
		.attr("transform", "translate(10," + "10" + ")");

	let nodeByID = {};
	let hoverTextBox = svg.append("g");

	let hoverText = hoverTextBox
		.append("text")
		.attr("text-anchor", "end");




	// Add zoom behavior
	const zoom = d3.zoom()
		.scaleExtent([0.1, 10])
		.on('zoom', () => {
			const transform = d3.event.transform;

			// console.log(selectedView.selectAll(".nodesSelected"));
			currentTransform = transform;

			nodesView.attr('transform', currentTransform);
			// linksView.attr('transform', transform);
			selectedView.attr('transform', currentTransform);
			needsUpdate = true;
			// console.log(currentTransform);
			// edgesView.attr('transform', transform);
		});

	// // Apply zoom behavior to svg
	svg.call(zoom)
	.on("dblclick.zoom", d=>{
		
	});

	
	function setDrawNetwork(network, networkName) {
		currentNetworkName = networkName;
		currentNetwork = network;
		// console.log(currentNetwork)
		let newNodes = [];
		let nodesDictionary = {};
		let ID2Nodes = {};
		links = [];
		let majorComponentSet = new Set();
		nodeByID = {};
		for (let index = 0; index < network.nodesCount; index++) {
			let inMajorComponent = false;
			if (network.verticesProperties.community) {
				if (network.verticesProperties.community[index] >= 0) {
					majorComponentSet.add(index);
					inMajorComponent = true;
				}
			} else {
				majorComponentSet.add(index);
				inMajorComponent = true;
			}

			if (inMajorComponent) {
				let node = {
					"id": IDProperty ? network.verticesProperties[IDProperty][index] : (network.names ? network.names[index] : index),
				}
				nodeByID[node["id"]] = node;
				for (let attribute in network.verticesProperties) {
					if (network.verticesProperties.hasOwnProperty(attribute)) {
						let element = network.verticesProperties[attribute];
						node[attribute] = element[index];
					}
				}
				if (network.names) {
					node["name"] = network.names[index]
				}
				node.index = newNodes.length;
				node.neigh = [];
				node.strength = 0;
				newNodes.push(node);
				nodesDictionary[index] = node;
				ID2Nodes[node.id] = node;
			}
		}

		for (let index = 0; index < network.edges.length; index++) {
			let edge = network.edges[index];
			if (majorComponentSet.has(edge[0]) && majorComponentSet.has(edge[1])) {
				let fromNode = nodesDictionary[edge[0]];
				let toNode = nodesDictionary[edge[1]];

				let edgeObject = {
					source: fromNode,
					target: toNode,
					weight: network.weights ? network.weights[index] : 1.0,
				}
				fromNode.neigh.push(toNode);
				toNode.neigh.push(fromNode);
				fromNode.strength = edgeObject.weight;
				toNode.strength = edgeObject.weight;
				links.push(edgeObject);
			}
		}

		nodes.forEach(node => {
			let previousID = node.id;
			if (ID2Nodes.hasOwnProperty(previousID)) {
				let newNode = ID2Nodes[previousID];
				newNode.x = node.x;
				newNode.y = node.y;
				newNode.vx = node.vx;
				newNode.vy = node.vy;
				newNode.existed = true;
			}
		});

		newNodes.forEach(node => {
			let sumX = 0;
			let sumY = 0;
			let sumVX = 0;
			let sumVY = 0;
			let sumCount = 0;
			if (!node.existed) {
				node.neigh.forEach(neighNode => {
					if (neighNode.existed) {
						sumX += neighNode.x;
						sumY += neighNode.y;
						sumVX += neighNode.vx;
						sumVY += neighNode.vy;
						sumCount++;
					}
				});
				node.x = sumX / sumCount;
				node.y = sumVY / sumCount;
				node.vx = sumVX / sumCount;
				node.vy = sumVY / sumCount;
			}
		});

		nodes = newNodes;
	}




	function contains(a, obj) {
		var i = a.length;
		while (i--) {
			if (a[i] === obj) {
				return true;
			}
		}
		return false;
	}



	function restart() {
		if (timelines) {
			nodes.forEach(d => {
				let communityInTime = d[colorProperty] + "_" + 1;
				// console.log("NONSDOSANDOASJHODJA");
				d.color = color(timelines[communityInTime]);
				d.timeline = timelines[communityInTime];
				d.orderIndex = timeline;
				// if (propertyToColor.hasOwnProperty(d[colorProperty])) {
				// 	d.color = propertyToColor[d[colorProperty]];
				// } else {
				// 	if (useDarkBackground) {
				// 		d.color = "#333333";
				// 	} else {
				// 		d.color = "#cccccc";
				// 	}
				// }
			});
		} else {
			color = d3.scaleOrdinal(d3.schemeCategory10);
			let topColorProperties = sortByFrequency(nodes.map(d => d[colorProperty])).slice(0, 10);
			let propertyToColor = {};
			let propertyToIndex = {};

			topColorProperties.forEach((d, i) => {
				propertyToColor[d] = color(d);
				propertyToIndex[d] = i;
			});
			nodes.forEach(d => {
				if (propertyToColor.hasOwnProperty(d[colorProperty])) {
					d.color = propertyToColor[d[colorProperty]];
					d.orderIndex = propertyToIndex[d[colorProperty]];
				} else {
					if (useDarkBackground) {
						d.color = "#333333";
					} else {
						d.color = "#cccccc";
					}
					d.orderIndex = Infinity;
				}
			});

			// console.log(nodes);
		}
		//sortNodes by orderIndex (descending)
		let sortedNodes = nodes.sort((a, b) => a.orderIndex - b.orderIndex);

		// console.log(sortedNodes);
		d3.select("#labelsPanel")
			.selectAll(".labelItem")
			.data(sortedNodes)
			.join(
				enter => {
					return enter.append("div")
						.classed("labelItem", true);
					// .style("opacity", 0)
					// .style("max-height", 0);;
				},
				update => {
					return update
						.style("color", d => d.color);
					// .style("opacity", 1)
					// .style("max-height", null)

				},
				exit => {
					//disappear and remove
					return exit.remove();
				}
			)
			.style("color", d => d.color)
			// .attr("id", d => "label_" + d.id)
			.text(d => `${displayProperties[0] == "name" ? d.name : d[displayProperties[0]]}`)
			.on("mouseover", function (d) {
				hoverNode = d;
				hoverText.attr("fill", d.color)
				displayProperties.forEach((displayProperty, i) => {
					// .text(`${displayProperty=="name"?d.name:d[displayProperty]}\n${d[displayProperty]}`);

					hoverText.append("tspan")
						.attr("dy", "1.2em")
						.attr("x", "0")
						.style("font-size", i == 0 ? "15px" : "13px")
						.text(`${displayProperty == "name" ? d.name : d[displayProperty]}`);
				});
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			.on("mouseout", function (d) {
				hoverText.text(null).select("tspan").remove();
				hoverNode = null;
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			.on("click", function (d) {
				if (!d3.event.shiftKey) {
					selectedNodes.clear();
				}
				if (selectedNodes.has(d.id)) {
					console.log("unselecting " + d.id);
					selectedNodes.delete(d.id);
				} else {
					console.log("selecting " + d.id);
					selectedNodes.add(d.id);
				}
				updateSelectedNodes();
				d3.event.stopPropagation();
			});


		let nodesSizes = [];
		nodes.forEach(d => {
			d.size = maxNodeSize;
			d.degrees = 0;
			if (sizeProperty == "degree") {
				d.sizeRaw = 0
			} else {
				d.sizeRaw = +d[sizeProperty];
			}
		});

		//Degrees as color:
		links.forEach(d => {
			d.source.degrees += d.weight;
			d.target.degrees += d.weight;
			if (sizeProperty == "degree") {
				d.source.sizeRaw = d.source.degrees;
				d.target.sizeRaw = d.target.degrees;
			}
		});

		let maxSizeProperty = d3.max(nodes, d => d.sizeRaw);
		let minSizeProperty = 0;//d3.min(nodes, d => d.sizeRaw);
		nodes.forEach(d => {

			let s = (d.sizeRaw - minSizeProperty) / (maxSizeProperty - minSizeProperty);
			s = Math.pow(s, sizePowerCoeff);
			d.sizeFactor = s;
			d.size = (1 - s) * minNodeSize + s * maxNodeSize;
		});

		let maxWeight = d3.max(links, d => d.weight);
		let minWeight = d3.min(links, d => d.weight);

		links.forEach(d => {
			d.color = gradient(d.source.color, d.target.color);
			let s = d.weight * 0.5;//(d.weight-minWeight)/(maxWeight-minWeight);
			s = Math.pow(s, widthPowerCoeff);
			d.widthFactor = s;
			d.width = (1 - s) * minWidthSize + s * maxWidthSize;
			let minimumSize = Math.min(d.target.size, d.source.size);
			if (minimumSize < d.width) {
				d.width = minimumSize;
			}
		});

		// Apply the general update pattern to the nodes.
		nodesView = nodesView.data(nodes, function (d) { return d.id; });
		nodesView.exit().remove();
		nodesView = nodesView.enter().append("circle")
			.merge(nodesView)
			.style('opacity', 1)
			.attr("stroke", d => d3.rgb(d.color).darker(0.5))
			.attr("stroke-width", 1.5)
			.attr("fill", d => d.color)
			.attr("r", d => d.size)
			.on("mouseover", function (d) {
				hoverNode = d;

				d3.select(this).attr("r", d.size * 1.25)
					.attr("stroke", d3.rgb(d.color).darker(1))
					.attr("stroke-width", 3);
				hoverText.attr("fill", d.color)
				displayProperties.forEach((displayProperty, i) => {
					// .text(`${displayProperty=="name"?d.name:d[displayProperty]}\n${d[displayProperty]}`);

					hoverText.append("tspan")
						.attr("dy", "1.2em")
						.attr("x", "0")
						.style("font-size", i == 0 ? "15px" : "13px")
						.text(`${displayProperty == "name" ? d.name : d[displayProperty]}`);
				});
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			.on("mouseout", function (d) {
				d3.select(this).attr("r", d => d.size)
					.attr("stroke", d => d3.rgb(d.color).darker(0.5))
					.attr("stroke-width", 1.0);
				hoverText.text(null).select("tspan").remove();
				hoverNode = null;
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
			.on("click", function (d) {
				if (!d3.event.shiftKey) {
					selectedNodes.clear();
				}
				if (selectedNodes.has(d.id)) {
					console.log("unselecting " + d.id);
					selectedNodes.delete(d.id);
				} else {
					console.log("selecting " + d.id);
					selectedNodes.add(d.id);
				}
				updateSelectedNodes();
				d3.event.stopPropagation();
			})
		d3.select("#networkView").on("click", d => {
			if (!d3.event.shiftKey) {
				selectedNodes.clear();
				updateSelectedNodes();
			}
		});


		if (renderLinksSVG) {
			createSVGLinks();
		}

		if (renderLinksGL) {
			updateGLNodesAndEdges();
			updateEdgesGLGeometry();
			updateNodesGLColors();
		}
		// Update and restart the simulation.
		simulation.nodes(nodes);
		simulation.force("link").links(links);
		simulation
			.alpha(0.6)
			.restart();

		if(currentTransform){
			nodesView.attr('transform', currentTransform);
		}
		updateLegend();
		updateSelectedNodes();

	}

	function createSVGLinks() {
		linksView = linksView.data(links, d => d.source.id + "-" + d.target.id);
		linksView.exit().remove();

		if (renderGradientLinks) {
			let linkNew = linksView.enter().append("g");

			linkNew.append("line")
				.attr("stroke", d => d.color)
				.attr("stroke-width", "5px")
				.attr("opacity", 1.0)
				.attr("x1", 0)
				.attr("y1", 0)
				.attr("x2", 1.0 / Math.sqrt(2))
				.attr("y2", 1.0 / Math.sqrt(2))//Hack
				.attr("vector-effect", "non-scaling-stroke");

			linksView = linkNew.merge(linksView);
		} else {
			let linkNew = linksView.enter().append("line")
				.attr("opacity", 0.1);
			linksView = linkNew.merge(linksView);
		}
	}


	function updateSelectedNodes(justUpdate = false) {
		let verticalOffset = -10;
		if (!justUpdate) {
			// console.log("updating...");
			// console.log(Array.from(selectedNodes).map(d=>nodeByID[d]))
			let selectedNodesArray = Array.from(selectedNodes).map(d => nodeByID[d]).filter(d => d)

			if (hoverNode && !selectedNodes.has(hoverNode.id)) {
				selectedNodesArray.push(hoverNode);
			}
			selectedLabels = selectedLabels.data(selectedNodesArray);
			selectedLabels.exit().remove();
			let selectedViewNew = selectedLabels.enter()
				.append("g")
				.classed("nodesSelected", true)
				.classed("nointeraction", true);

			selectedViewNew.append("path").attr("d",
				`M ${-verticalOffset * 1},${verticalOffset + 3} L ${0},${0} L ${+verticalOffset * 1},${verticalOffset + 3} z`)
			let textView = selectedViewNew.append("g")
				.attr("transform", (d, i) => ("translate(" + 0 + "," + verticalOffset + ")"))
				.classed("textbox", true);
			textView.append("text").classed("outline", true);
			textView.append("text").classed("name", true);
			selectedLabels = selectedViewNew.merge(selectedLabels);
			d3.selectAll(".labelItem").classed("selected", node => {
				return selectedNodes.has(node.id);
			});
		}

		let scaleUpdate = 1.0/(currentTransform?.k||1.0);
		// selectedView.selectAll(".nodesSelected").attr("transform", `scale(${scaleUpdate},${scaleUpdate})`);

		selectedLabels
			.attr("transform", (d, i) => (`translate(${xscale(d.x)}, ${yscale(d.y)}) scale(${scaleUpdate},${scaleUpdate})`));

		selectedLabels.select(".name")
			.attr("fill", d => d3.rgb(d.color).darker(1))
			.attr("font-size", "19px")
			.attr("text-anchor", "middle")
			.text(d => `${displayProperties[0] == "name" ? d.name : d[displayProperties[0]]}`);

		selectedLabels.select(".outline")
			.attr("fill", "white")
			.attr("stroke", "white")
			.attr("stroke-width", 6)
			.attr("font-size", "19px")
			.attr("text-anchor", "middle")
			.style('opacity', 0.9)
			.text(d => `${displayProperties[0] == "name" ? d.name : d[displayProperties[0]]}`);

		selectedLabels.select("path")
			.attr("fill", d => d3.rgb(d.color).darker(1))
			.attr("stroke", "white")
			.style('opacity', 0.9)
			.attr("stroke-width", 2)

	}

	function deleteSVGLinks() {
		linksView = linksView.data([]);
		linksView.exit().remove();
	}

	function updateSVGLinks(strokeFactor = 2.0) {
		if (renderGradientLinks) {
			linksView.attr("transform", d => {
				return getTransformForLine(
					xscale(d.source.x),
					yscale(d.source.y),
					xscale(d.target.x),
					yscale(d.target.y),
				);
			}).attr("stroke-width", d => {
				return strokeFactor / getStrokeCorrectionForLine(
					xscale(d.source.x),
					yscale(d.source.y),
					xscale(d.target.x),
					yscale(d.target.y),
				);
			});
		} else {
			linksView
				.attr("x1", d => xscale(d.source.x))
				.attr("y1", d => yscale(d.source.y))
				.attr("x2", d => xscale(d.target.x))
				.attr("y2", d => yscale(d.target.y));
		}
	}

	function updateLegend() {
		return;
		let legendItems = legendView.selectAll(".legend").data(Object.keys(partiesToColors));
		legendItems.exit().remove();


		let legendEnter = legendItems.enter().append("g")
			.classed("legend", true)
			.attr("transform", (d, i) => ("translate(0," + (i * 20) + ")"));

		legendEnter.append("rect");
		legendEnter.append("g").append("text");
		legendItems = legendItems.merge(legendEnter)

		legendItems.select("rect")
			.attr("x", 0)
			.attr("y", 0)
			.attr("width", 30)
			.attr("height", 15)
			.attr("fill", d => partiesToColors[d]);

		legendItems.select("g")
			.attr("transform", (d) => (`translate(${35},${15 / 2})`))
			.select("text")
			.text(d => partiesNames[d])
			.style("alignment-baseline", "central");

	}

	function updateGLNodesAndEdges() {
		positionArray = new Float32Array(nodes.length * 2);//2D
		colorArray = new Float32Array(nodes.length * 3);
		edgesIndices = new Uint16Array(links.length * 2);
		// console.log("Update Nodes and Edges Arrays Done!");
	}

	function updateNodesGLGeometry() {
		nodes.forEach((node, index) => {
			positionArray[index * 2] = (node.x ? ((xscale(node.x)) / width * 2 - 1) : 0.0);
			positionArray[index * 2 + 1] = (node.y ? (-(yscale(node.y)) / height * 2 + 1) : 0.0);
		});
		// for (let index = 0; index < nodes.length; index+=2) {
		// 	positionArray[index*2] = 0;
		// 	positionArray[index*2+1] = 0;
		// 	positionArray[index*2+2] = index/1000;
		// 	positionArray[index*2+3] = index*index/100000;
		// }

		gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, positionArray, gl.DYNAMIC_DRAW);
		// console.log(positionArray);
		// console.log(`Update Nodes Done! (${positionArray.length})` );
	}

	function updateEdgesGLGeometry() {
		links.forEach((edge, index) => {
			edgesIndices[index * 2] = edge.source.index;
			edgesIndices[index * 2 + 1] = edge.target.index;
		});


		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgesBuffer);
		gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, edgesIndices, gl.DYNAMIC_DRAW);
		// console.log(`Update Edges Done! (${edgesIndices.length})` );
	}

	function updateNodesGLColors() {

		nodes.forEach((node, index) => {
			let color = d3.rgb(node.color);
			colorArray[index * 3] = color.r / 255.0;
			colorArray[index * 3 + 1] = color.g / 255.0;
			colorArray[index * 3 + 2] = color.b / 255.0;
		});

		gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, colorArray, gl.DYNAMIC_DRAW);
		// console.log(`Update Colors Done! (${colorArray.length})` );
	}

	function redrawEdgesCanvas(){
		let ctx = canvasNode.getContext('2d');
		ctx.fillStyle = '#fff'
		ctx.clearRect(0, 0, canvasNode.width, canvasNode.height);
		ctx.scale(dpr, dpr);
		links.forEach(d => {
			ctx.lineWidth = d.width * dpr;
			let colorStart = d.source.color;
			let colorEnd = d.target.color;
			let scaleZoom = (currentTransform?.k || 1.0)
			let x1 = scaleZoom * xscale(d.source.x) + (currentTransform?.x || 0);
			let y1 = scaleZoom * yscale(d.source.y) + (currentTransform?.y || 0);

			let x2 = scaleZoom * xscale(d.target.x) + (currentTransform?.x || 0);
			let y2 = scaleZoom * yscale(d.target.y) + (currentTransform?.y || 0);

			ctx.globalAlpha = d.widthFactor * (maxLineOpacity - minLineOpacity) + minLineOpacity;
			if (renderGradientLinks) {
				let grad = ctx.createLinearGradient(x1, y1, x2, y2);
				grad.addColorStop(0.0, colorStart);
				grad.addColorStop(1.0, colorEnd);
				ctx.strokeStyle = grad;
			} else {
				ctx.strokeStyle = colorStart;
			}
			ctx.beginPath();
			ctx.moveTo(x1, y1);
			ctx.lineTo(x2, y2);
			ctx.stroke();
		});
	}

	function redrawEdgesGL() {

		dpr = window.devicePixelRatio || 1;
		needsUpdate = false;
		// gl.depthMask(false);
		if (useDarkBackground) {
			gl.clearColor(0.0, 0.0, 0.0, 1.0);
		} else {
			gl.clearColor(1.0, 1.0, 1.0, 1.0);
		}

		gl.clear(gl.COLOR_BUFFER_BIT);

		gl.lineWidth(linesWidth * dpr);
		gl.enable(gl.BLEND);
		if (useDarkBackground) {
			gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
		} else {
			//gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
			gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA,
				gl.ZERO, gl.ONE);
		}

		updateNodesGLGeometry();

		edgesShaderProgram.use(gl);

		edgesShaderProgram.attributes.enable("vertex");
		edgesShaderProgram.attributes.enable("color");

		gl.bindBuffer(gl.ARRAY_BUFFER, positionsBuffer);
		gl.vertexAttribPointer(edgesShaderProgram.attributes.vertex, 2, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ARRAY_BUFFER, colorsBuffer);
		gl.vertexAttribPointer(edgesShaderProgram.attributes.color, 3, gl.FLOAT, false, 0, 0);

		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, edgesBuffer);

		//gl.uniform2fv(edgesShaderProgram.uniforms.nearFar,[0.1,10.0]);

		let maxLineIntensity = gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE)[1];
		let currentLineIntensity = linesIntensity;
		if (maxLineIntensity == 1 && linesIntensity < 0.5) {
			currentLineIntensity *= 2 * dpr;
		}
		gl.uniform1f(edgesShaderProgram.uniforms.linesIntensity, currentLineIntensity);

		//drawElements is called only 1 time. no overhead from javascript
		gl.drawElements(gl.LINES, edgesIndices.length, indexType, 0);

		//disabling attributes
		edgesShaderProgram.attributes.disable("vertex");
		edgesShaderProgram.attributes.disable("color");

	}



	let svgNode = svg.node();
	let canvasNode = canvas.node();

	function redraw() {
		width = svgNode.clientWidth;
		height = svgNode.clientHeight;


		dpr = window.devicePixelRatio || 1;

		var rect = canvasNode.getBoundingClientRect();

		canvasNode.width = width * dpr;
		canvasNode.height = height * dpr;


		hoverTextBox
			.attr("transform", `translate(${width - 20},10)`);

		let xextent = d3.extent(nodes, d => d.x);
		let yextent = d3.extent(nodes, d => d.y);

		let xcenter = d3.mean(nodes, d => d.x);
		let ycenter = d3.mean(nodes, d => d.y);

		let dataWidth = 2 * d3.max([xcenter - xextent[0], xextent[1] - xcenter]);
		let dataHeight = 2 * d3.max([ycenter - yextent[0], yextent[1] - ycenter]);


		let panelAspectRatio = width / height;
		let dataAspectRatio = dataWidth / dataHeight;

		if (dataWidth > 0 && dataHeight > 0) {
			if (dataAspectRatio > panelAspectRatio) {
				targetScaleFactor = width / dataWidth;
			} else {
				targetScaleFactor = height / dataHeight;
			}
		}


		let gamma = 0.05
		if (scaleFactor > 0) {
			scaleFactor = scaleFactor * (1 - gamma) + targetScaleFactor * gamma;
		} else {
			scaleFactor = targetScaleFactor;
		}


		xscale
			.range([width / 2 - dataWidth / 2 * scaleFactor * zoomScale, width / 2 + dataWidth / 2 * scaleFactor * zoomScale])
			.domain([xcenter - dataWidth / 2, xcenter + dataWidth / 2]);

		yscale
			.range([height / 2 - dataHeight / 2 * scaleFactor * zoomScale, height / 2 + dataHeight / 2 * scaleFactor * zoomScale])
			.domain([ycenter - dataHeight / 2, ycenter + dataHeight / 2]);

		// xscale = xscale.domain());
		// yscale = yscale.domain(d3.extent(nodes,d=>d.y));

		// // Add zoom behavior


		nodesView
			.attr("cx", d => xscale(d.x))
			.attr("cy", d => yscale(d.y))


		if (renderLinksGL) {
			if (edgesIndices && colorArray && edgesIndices) {
				gl.viewport(0, 0, canvasNode.width, canvasNode.height);
				redrawEdgesGL();
			}
		}

		if (renderLinksCanvas) {
			needsUpdate = false;
			redrawEdgesCanvas();
		}

		if (renderLinksSVG) {
			updateSVGLinks();
		}
		updateSelectedNodes(true);
		if (Math.abs(scaleFactor - targetScaleFactor) > 0.005) {
			needsUpdate = true;
		}
	}

	async function getNetwork(filename) {
		return await readNetworkFile("Networks/" + filename);
	}


	//Loading Networks
	let networks = [];
	let timelines = null;//extraDataset["timelines"];

	const queryString = window.location.search;
	const urlParams = new URLSearchParams(queryString);

	let networkInformation = await fetch("networkData.json").then(response => response.json());
    // ["Fed_vs_16hr_fast_signif-correlation-0.61-0.10": {
    //     "maxModularity": 0.0,
    //     "maxModularityWeighted": 0.0,
    //     "networkName": "Fed_vs_16hr_fast_signif",
    //     "thresholdWeight": 0.61,
    //     "thresholdBackbone": 0.1
    // },...]

	let networkNames = Object.keys(networkInformation);
	let allThresholdsSet = new Set();
	let allBackboneThresholdsSet = new Set();

	networkNames.forEach(networkName => {
		let networkInfo = networkInformation[networkName];
		let thresholdWeight = networkInfo.thresholdWeight;
		let thresholdBackbone = networkInfo.thresholdBackbone;
		allThresholdsSet.add(thresholdWeight);
		allBackboneThresholdsSet.add(thresholdBackbone);
	});

	let index2threshold = Array.from(allThresholdsSet).sort((a, b) => a - b);
	let index2backboneThreshold = Array.from(allBackboneThresholdsSet).sort((a, b) => a - b);

	let indexPair2networkName = {};

	networkNames.forEach(networkName => {
		let networkInfo = networkInformation[networkName];
		let thresholdWeight = networkInfo.thresholdWeight;
		let thresholdBackbone = networkInfo.thresholdBackbone;
		let indexWeight = index2threshold.indexOf(thresholdWeight);
		let indexBackbone = index2backboneThreshold.indexOf(thresholdBackbone);
		indexPair2networkName[indexWeight + "_" + indexBackbone] = networkName;
	});

	let thresholdsBackbone = index2backboneThreshold;
	// generate array from 0.6 to 0.96 with step 0.01
	let threshodlsWeight = index2threshold;
	// middle of thresholdsBackbone array
	let currentThresholdBackboneIndex = Math.floor(thresholdsBackbone.length / 2);
	let currentThresholdWeightIndex = Math.floor(threshodlsWeight.length / 2);

	console.log(allBackboneThresholdsSet);


	async function getNetworkFromThresholds(thresholdIndex, thresholdBackboneIndex) {
		let filename = indexPair2networkName[thresholdIndex + "_" + thresholdBackboneIndex];
		let network = await getNetwork(filename);
		return network;
	}

	function networkNameFromThresholds(thresholdIndex, thresholdBackboneIndex) {
		return `T${+thresholdIndex}_B${thresholdBackboneIndex}`
	}

	let displayNetwork = null;

	displayProperties = ["Label"];
	IDProperty = "Label";
	colorProperty = "Leiden Layered";
	displayNetwork = await getNetworkFromThresholds(currentThresholdWeightIndex, currentThresholdBackboneIndex);


	setDrawNetwork(displayNetwork, networkNameFromThresholds(currentThresholdWeightIndex, currentThresholdBackboneIndex));

	// window.setNetwork = (i) => {
	// 	let network = networks[i];
	// 	if (network) {
	// 		setDrawNetwork(network, i);
	// 		restart();
	// 	}
	// }


	d3.select("#timeSlider")
		.property("max", threshodlsWeight.length - 1)
		.property("value", startIndex)
		.on("input", async function input() {
			currentThresholdWeightIndex = +this.value;
			displayNetwork = await getNetworkFromThresholds(currentThresholdWeightIndex, currentThresholdBackboneIndex)
			setDrawNetwork(displayNetwork, networkNameFromThresholds(currentThresholdWeightIndex, currentThresholdBackboneIndex));

			restart();
			myRequestAnimationFrame(() => {
				redraw();
			});
		});

	d3.select("#timeSliderBackbone")
		.property("max", thresholdsBackbone.length - 1)
		.property("value", startIndex)
		.on("input", async function input() {
			currentThresholdBackboneIndex = +this.value;
			displayNetwork = await getNetworkFromThresholds(currentThresholdWeightIndex, currentThresholdBackboneIndex)
			setDrawNetwork(displayNetwork, networkNameFromThresholds(currentThresholdWeightIndex, currentThresholdBackboneIndex));

			restart();
			myRequestAnimationFrame(() => {
				redraw();
			});
		});
	// oioi();

	restart();
	redraw();
	redrawRuler();
	redrawRulerBackbone();
	window.addEventListener("resize", () => {
		myRequestAnimationFrame(() => {
			needsUpdate = false;
			redrawRuler();
			redraw();
		});
	});

	function redrawRuler() {
		let timeRulerSVG = d3.select("#timeRule");
		let ruleWidth = timeRulerSVG.node().clientWidth;
		let ruleHeight = timeRulerSVG.node().clientHeight;
		let ruleScale = d3.scaleLinear()
			.range([5, ruleWidth - 5])
			.domain([0, threshodlsWeight.length - 1]);
		timeRulerSVG.selectAll("*").remove();
		timeRulerSVG.append("g")
			.attr("class", "axis")
			.attr("transform", "translate(0," + "20" + ")")
			.call(d3.axisTop(ruleScale)
				.ticks(threshodlsWeight.length - 1)
				.tickFormat(d3.timeFormat("")));

		timeRulerSVG.append("g")
			.attr("class", "axis")
			.attr("transform", "translate(0," + "20" + ")")
			.call(d3.axisTop(ruleScale)
				.ticks(threshodlsWeight.length - 1)
				.tickFormat(d => { return threshodlsWeight[d].toPrecision(2) }));
		// .selectAll("text")	
		//   .style("text-anchor", "end")
		//   .attr("dx", "-.8em")
		//   .attr("dy", ".15em")
		//   .attr("transform", "rotate(-65)");



	}

	function redrawRulerBackbone() {
		let timeRulerSVG = d3.select("#timeRuleBackbone");
		let ruleWidth = timeRulerSVG.node().clientWidth;
		let ruleHeight = timeRulerSVG.node().clientHeight;
		let ruleScale = d3.scaleLinear()
			.range([5, ruleWidth - 5])
			.domain([0, thresholdsBackbone.length - 1]);
		timeRulerSVG.selectAll("*").remove();
		timeRulerSVG.append("g")
			.attr("class", "axis")
			.attr("transform", "translate(0," + "20" + ")")
			.call(d3.axisTop(ruleScale)
				.ticks(thresholdsBackbone.length - 1)
				.tickFormat(d3.timeFormat("")));

		timeRulerSVG.append("g")
			.attr("class", "axis")
			.attr("transform", "translate(0," + "20" + ")")
			.call(d3.axisTop(ruleScale)
				.ticks(thresholdsBackbone.length - 1)
				.tickFormat(d => { return thresholdsBackbone[d].toPrecision(1) }));
		// .selectAll("text")	
		//   .style("text-anchor", "end")
		//   .attr("dx", "-.8em")
		//   .attr("dy", ".15em")
		//   .attr("transform", "rotate(-65)");



	}

	function zoomAnimation() {
		if (needsUpdate) {
			redraw();
		}
		myRequestAnimationFrame(zoomAnimation);
	}


	myRequestAnimationFrame(zoomAnimation);


}

startVisualization();


// bash compress directory metabolites_net to tar
// tar -C metabolites_net -zcvf metabolites_net.tar.gz ./