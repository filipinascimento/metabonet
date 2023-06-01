
/* global d3 saveAs d3_save_svg */

"use strict";


const kDefaultVisualizerProperties = {
	minSize:50,
	edgePercentile: 0.50,
	sizeScale: 3,
	maxSimilarityConnections: 5,
	matchSimilarityFraction: 0.1,
	desaturateBrightness: 0.5,
	desaturateRatio: 0.5,
	notHighlightedAlpha: 0.2,
	height: 1500,
	padding: 5,
	boxSize: 120,
	collisionForceEnabled:false,
	defaultColor: "#aaaaaa",
	styleColors: [
		"#1f77b4",
		"#ff7f0e",
		"#2ca02c",
		"#d62728",
		"#9467bd",
		"#8c564b",
		"#e377c2",
		"#bcbd22",
		"#17becf",
		"#aec7e8",
		"#ffbb78",
		"#98df8a",
		"#ff9896",
		"#c5b0d5",
		"#c49c94",
		"#f7b6d2",]
}



function boundedBox() {
	var nodes;
	var bounds;

	function force() {
		var node;
		var xi, x0, x1, yi, y0, y1;
		var i = -1;
		while (++i < nodes.length) {
			node = nodes[i];
			xi = node.x + node.vx;
			x0 = bounds[0][0] - (xi);
			x1 = bounds[1][0] - (xi);
			yi = node.y + node.vy;
			y0 = bounds[0][1] - (yi);
			y1 = bounds[1][1] - (yi);
			if (x0 > 0) {
				node.x += x0;
				node.vx = 0;
			} else if (x1 < 0) {
				node.x += x1;
				node.vx = 0;
			}
			if (y0 > 0) {
				node.y += y0;
				node.vy = 0;
			} else if (y1 < 0) {
				node.y += y1;
				node.vy = 0;
			}
		}
	}

	force.initialize = function (_) {
		nodes = _;
	};

	force.bounds = function (_) {
		return arguments.length ? ((bounds = _), force) : bounds;
	};

	return force;
}


function FPSControl(fps, callback) {

	var delay = 1000 / fps,
		time = null,
		frame = -1,
		tref;

	this.tick = callback;

	function loop(timestamp) {
		if (time === null) time = timestamp;
		var seg = Math.floor((timestamp - time) / delay);
		if (seg > frame) {
			frame = seg;
			callback({
				time: timestamp,
				frame: frame
			})
		}
		tref = myRequestAnimationFrame(loop)
	}

	this.isPlaying = false;

	this.frameRate = function (newfps) {
		if (!arguments.length) return fps;
		fps = newfps;
		delay = 1000 / fps;
		frame = -1;
		time = null;
	};

	this.start = function () {
		if (!this.isPlaying) {
			this.isPlaying = true;
			tref = myRequestAnimationFrame(loop);
		}
	};

	this.pause = function () {
		if (this.isPlaying) {
			myCancelAnimationFrame(tref);
			this.isPlaying = false;
			time = null;
			frame = -1;
		}
	};
}



function displaySize(size){
	return 1 + Math.sqrt(size) / 15;
}

function displayWidth(width){
	return Math.sqrt(width);
}

function brighter(colorValue, a){
	let c = d3.hsl(colorValue);
	c.l = (c.l * (1.0 - a) + 1.0 * (a));
	return c;
}

function desaturate(colorValue, a, b){
	let c = d3.hsl(colorValue);
	c.l = (c.l * (1.0 - a) + 1.0 * (a));
	c.s = (c.l * (1.0 - b) + 0.0 * (b));
	return c;
}

function darker(colorValue, a){
	let c = d3.hsl(colorValue);
	c.l = (c.l * (1.0 - a));
	return c;
}


class TimelineVisualizer{
	constructor(data,properties){
		if(properties){
			this.properties = {...kDefaultVisualizerProperties, ...properties};
		}else{
			this.properties = {...kDefaultVisualizerProperties};
		}

		this.data = data;
		this.ticked = [];

		this.boxCount = this.data["networkSpecifications"].length;

		this.nodes = [...Array(this.boxCount)].map(d=>[]);
		this.edges = [...Array(this.boxCount)].map(d=>[]);
		this.groupsByName = [...Array(this.boxCount)].map(d=>[]);

		this.similarityEdges = [...Array(this.boxCount-1)].map(d=>[]);
		this.groupSimilarityEdges = [...Array(this.boxCount-1)].map(d=>[]);
		this.nodeAttributes = [...Array(this.boxCount)].map(d=>{});

		this.displayNodes = [...Array(this.boxCount)].map(d=>[]);
		this.displayEdges = [...Array(this.boxCount)].map(d=>[]);

		this.displayGroups = [...Array(this.boxCount)].map(d=>[]);

		this.displaySimilarityEdges = [...Array(this.boxCount-1)].map(d=>[]);
		this.displayGroupSimilarityEdges = [...Array(this.boxCount-1)].map(d=>[]);

		this.nodeElements = [...Array(this.boxCount)];
		this.edgeElements = [...Array(this.boxCount)];
		this.similarityElements = [...Array(this.boxCount-1)];

		this.weightScales = [...Array(this.boxCount)];
		this.selectedGroups = [...Array(this.boxCount)].map(d=>"ID");
		this.groupChoices = [...Array(this.boxCount)].map(d=>[]);


		this.createAnimation();
		this.createForces();

		this.prepareNetworks();

		this.setGroupsByIndex(0);
	
		this.generateGroups();
		this.generateTimelines();


		this.createSVGAndLayers();
		
		this.prepareDisplayNetworks();
		this.prepareDisplaySimilarities();
		this.updateDisplayNetworks();
		this.updateDisplaySimilarities();
		this.stylizeNetworks();
		this.stylizeSimilarities();
	}

	createSVGAndLayers(){
		this.properties.width = this.data["networkSpecifications"].length * (this.properties.padding + this.properties.boxSize) - this.properties.padding;
		this.svg = d3
			.select("body")
			.append("svg")
			.classed("plot", true)
			.attr("width", this.properties.width)
			.attr("height", this.properties.height);

		this.groupsLayer = this.svg.append("g").classed("groupsLayer", true);
		this.groupsLayer.similaritiesLayer = this.groupsLayer.append("g").classed("similarities",true);
		this.groupsLayer.edgesLayer = this.groupsLayer.append("g").classed("edges",true);
		this.groupsLayer.nodesLayer = this.groupsLayer.append("g").classed("nodes",true);

		this.networkLayer = this.svg.append("g").classed("networkLayer", true);
		this.networkLayer.similaritiesLayer = this.groupsLayer.append("g").classed("similarities",true);
		this.networkLayer.edgesLayer = this.groupsLayer.append("g").classed("edges",true);
		this.networkLayer.nodesLayer = this.groupsLayer.append("g").classed("nodes",true);

		this.groupsLayer.similaritiesBoxes = [];
		this.groupsLayer.edgesBoxes = [];
		this.groupsLayer.nodesBoxes = [];

		this.networkLayer.similaritiesBoxes = [];
		this.networkLayer.edgesBoxes = [];
		this.networkLayer.nodesBoxes = [];

		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			this.networkLayer.edgesBoxes.push(this.networkLayer.edgesLayer.append("g").classed("edgesBox",true));
			this.networkLayer.nodesBoxes.push(this.networkLayer.nodesLayer.append("g").classed("nodesBox",true));
			
			this.groupsLayer.edgesBoxes.push(this.groupsLayer.edgesLayer.append("g").classed("edgesBox",true));
			this.groupsLayer.nodesBoxes.push(this.groupsLayer.nodesLayer.append("g").classed("nodesBox",true));
		}

		for (let boxIndex = 0; boxIndex < this.boxCount-1; boxIndex++) {
			this.networkLayer.similaritiesBoxes.push(this.networkLayer.similaritiesLayer.append("g").classed("similaritiesBox",true));
			this.groupsLayer.similaritiesBoxes.push(this.groupsLayer.similaritiesLayer.append("g").classed("similaritiesBox",true));
		}

		this.titlesLayer = this.svg.append("g").classed("titlesLayer", true);
	}

	createAnimation(){
		this.networkAnimation = new FPSControl(30, () => {
			this.nextStep();
		});
	}
	
	createForces(){
		this.simulations = [];
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			let xCenter = boxIndex * (this.properties.padding + this.properties.boxSize) + this.properties.boxSize / 2;
			let yCenter = this.properties.height / 2;
			let linkForce = d3.forceLink()
			// .id((d, i) => d.id)
			.strength(edge => 0.5 * this.weightScales[boxIndex](edge.weight))
			.distance(0);
	
			let boxForce = boundedBox()
				.bounds([
					[xCenter - this.properties.boxSize / 2, 50],
					[xCenter + this.properties.boxSize / 2, this.properties.height - 50]
				]);

			let manyBodyForce = d3.forceManyBody()
				//.distanceMax(d => 0)
				.strength(-5);
	
			let gravityForce = d3.forceCenter(xCenter, yCenter);
			let collisionForce = d3.forceCollide().radius(d => d.displaySize + 1);
			let forceX = d3.forceX(xCenter).strength(0.1);
			let forceY = d3.forceY(yCenter).strength(0.0075);

			let tickCount = 0;
			let simulation = d3.forceSimulation()
				.force("link", linkForce)
				.force("charge", manyBodyForce)
				.force("forceX", d3.forceX(xCenter).strength(0.1))
				.force("forceY", d3.forceY(yCenter).strength(0.0075))
				// .force("similarity", similarityLinksForce)
				// .force("groups", groupsForce)
				.force("center", gravityForce)
				.force("boundaries", boxForce);
				//.on("tick",updateClustersCenters);
			
			simulation.currentTick = 0;
			simulation.on("tick", () => {
					if (simulation.currentTick == 20) {
						simulation.force("center", null);
						console.log("center off");
						simulation.currentTick += 1;
					} else if (simulation.currentTick < 20) {
						simulation.currentTick += 1;
					}
				})
				.stop();
			this.simulations.push(simulation);
		}
	}

	prepareNetworks(){
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			let networkSpecifications = this.data["networkSpecifications"][boxIndex];
			let network = networkSpecifications["network"];
			this.groupChoices[boxIndex] = networkSpecifications["attributesForSimilarity"];
			this.nodeAttributes[boxIndex] = network.verticesProperties;
			let nodes = [...Array(network.nodesCount)].map((d,i)=>({id:i}));
			let weights;
			if(network.weighted){
				weights = network.weights;
			}else{
				weights = network.edges.map(() => 1.0);
			}

			let edges = network.edges.map((d,i) => ({source:nodes[d[0]], target:nodes[d[1]], weight:weights[i]}));
			this.nodes[boxIndex] = nodes;
			this.edges[boxIndex] = edges;
			

			let averageWeights = 0;
			let averageWeights2 = 0;
			let edgesCount = 0;
			edges.forEach(edge => {
				averageWeights+=edge.weight;
				averageWeights2+=edge.weight*edge.weight;
				edgesCount++;
			});

			let percentileValue = d3.quantile(edges,this.properties.edgePercentile,edge=>edge.weight);
			this.weightScales[boxIndex] = d3.scaleLinear()
			// .domain([0,averageWeights+5*(averageWeights2-averageWeights*averageWeights)])
			.domain([percentileValue,d3.max(edges, edge => edge.weight)])
			.range([0, 1.0]);
		}
	}

	prepareDisplayNetworks(){
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			this.displayNodes[boxIndex].length=0;
			this.displayEdges[boxIndex].length=0;
			let filteredNodes = this.nodes[boxIndex];
			let filteredEdges = this.edges[boxIndex];
			if (this.nodeAttributes[boxIndex].hasOwnProperty("Size")) {
				let sizes = this.nodeAttributes[boxIndex]["Size"];
				let minSize = this.properties.minSize;
				let nodeFilter = node => sizes[node.id]>minSize;
				filteredNodes = filteredNodes.filter(nodeFilter);
				let weightScale = this.weightScales[boxIndex];
				filteredEdges = filteredEdges.filter(edge => nodeFilter(edge.source) && nodeFilter(edge.target) && weightScale(edge.weight)>0);
			}
			filteredNodes.forEach(node => {
				this.displayNodes[boxIndex].push(node);
			});
			filteredEdges.forEach(edge => {
				this.displayEdges[boxIndex].push(edge);
			});
			this.simulations[boxIndex].nodes(this.displayNodes[boxIndex]);
			this.simulations[boxIndex].force("link").links(this.displayEdges[boxIndex]);
		}
	}

	prepareDisplaySimilarities(){
		//IDs
		for (let boxIndex = 0; boxIndex < this.boxCount-1; boxIndex++) {
			this.displaySimilarityEdges[boxIndex].length = 0;
			let filteredSimilarityEdges = this.similarityEdges[boxIndex];
			if (this.nodeAttributes[boxIndex].hasOwnProperty("Size") && this.nodeAttributes[boxIndex+1].hasOwnProperty("Size")) {
				let currentSizes = this.nodeAttributes[boxIndex]["Size"];
				let nextSizes = this.nodeAttributes[boxIndex+1]["Size"];
				let minSize = this.properties.minSize;
				let currentNodeFilter = node => currentSizes[node.id]>minSize;
				let nextNodeFilter = node => nextSizes[node.id]>minSize;
				filteredSimilarityEdges = filteredSimilarityEdges.filter(edge => currentNodeFilter(edge.source) && nextNodeFilter(edge.target) && edge.weight>0);
				filteredSimilarityEdges.forEach(edge => {
					this.displaySimilarityEdges[boxIndex].push(edge);
				});
			}
		}
	}

	updateDisplayNetworks() {
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {

			let nodeElements = this.networkLayer.nodesBoxes[boxIndex].selectAll("circle")
				.data(this.displayNodes[boxIndex]);
			nodeElements.exit().remove();
			let nodeEnter = nodeElements
				.enter().append("circle");
			//.attr("r", d => d.displaySize);

			let edgeElements = this.networkLayer.edgesBoxes[boxIndex].selectAll("line")
				.data(this.displayEdges[boxIndex]);
			edgeElements.exit().remove();
			let edgeEnter = edgeElements
				.enter().append("line");
			
			this.nodeElements[boxIndex] = nodeEnter.merge(nodeElements);
			this.edgeElements[boxIndex] = edgeEnter.merge(edgeElements);

		}
	}

	updateDisplaySimilarities() {
		for (let boxIndex = 0; boxIndex < this.boxCount-1; boxIndex++) {

			let similarityElements = this.networkLayer.similaritiesBoxes[boxIndex].selectAll("line")
				.data(this.displaySimilarityEdges[boxIndex]);

			similarityElements.exit().remove();

			let similarityEnter = similarityElements
				.enter().append("line");
			
			this.similarityElements[boxIndex] = similarityEnter.merge(similarityElements);

		}
	}


	setGroupsByIndex(similarityAttributeIndex){
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			this.selectedGroups[boxIndex] = this.groupChoices[boxIndex][similarityAttributeIndex];
		}
	}
	
	generateGroups(){
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			this.groupsByName[boxIndex] = {};
			if(this.selectedGroups[boxIndex]=="ID"){
				this.nodes.forEach(node => {
					delete node.group;
				});
			}else{
				let nodeGroupNames =  this.nodeAttributes[boxIndex][this.selectedGroups[boxIndex]];
				let nodeGroupLabels =  this.nodeAttributes[boxIndex]["labels_"+this.selectedGroups[boxIndex]];
				let groupSet = new Set(nodeGroupNames);
				let groupLabels = {};
				if(nodeGroupLabels){
					nodeGroupNames.forEach((group,index) => {
						groupLabels[nodeGroupNames[index]] = nodeGroupLabels[index];
					});
				}
				let currentID = 0;
				let groupNameToGroup = {};
				let groups = [];
				groupSet.forEach(groupName => {
					let group = {
						id:currentID,
						name:groupName,
						nodes:[]
					}
					if(groupName in groupLabels){
						group.label = groupLabels[groupName];
					}else{
						group.label = group.name;
					}
					groups.push(group);
					groupNameToGroup[groupName] = group;
					currentID++;
				});
				this.groupsByName[boxIndex] = groupNameToGroup;
				this.nodes.forEach(node => {
					node.group = groupNameToGroup[nodeGroupNames[node.id]];
					node.group.nodes.push(node);
				});
			}
		}
	}
	
	generateTimelines(){
		this.timelines = [];
		this.groupTimelines = [];

		for (let boxIndex = 0; boxIndex < this.boxCount-1; boxIndex++) {
			let timelineData = this.data["timelineData"][boxIndex];

			let currentGroupName = this.selectedGroups[boxIndex];
			let nextGroupName = this.selectedGroups[boxIndex+1];
			
			let currentNodes = this.nodes[boxIndex];
			let nextNodes = this.nodes[boxIndex+1];
			currentNodes.forEach(node => { 
				delete node.next;
				node.forwardEdges = [];
			});
			nextNodes.forEach(node => { 
				delete node.previous;
				node.backwardEdges = [];
			});
			let similarities = timelineData.find( similarity => (similarity.currentAttribute == "ID"  && similarity.nextAttribute == "ID"));
			this.similarityEdges[boxIndex] = [];
			if(similarities){
				let forwardSimilarities = similarities.forwardSimilarities;
				let backwardSimilarities = similarities.backwardSimilarities;
				let similarityEdgesByName = {};

				forwardSimilarities.forEach( (weightTargets,nodeIndex) => {

					weightTargets.forEach((weightTarget,order) => {
						let similarityEdge = {
							source: currentNodes[nodeIndex],
							target: nextNodes[weightTarget[1]],
							weight: weightTarget[0],
							match: false,
							forwardOrder: order
						}

						let similarityEdgeName = similarityEdge.source.id+"-"+similarityEdge.target.id;
							
						if(!similarityEdgesByName.hasOwnProperty(similarityEdgeName)){
							this.similarityEdges[boxIndex].push(similarityEdge);	
							similarityEdgesByName[similarityEdgeName] = similarityEdge;
						}else{
							similarityEdge = similarityEdgesByName[similarityEdgeName];
							if(similarityEdge.forwardOrder==0 && similarityEdge.backwardOrder==0){
								similarityEdge.match = true;
								similarityEdge.source.next = similarityEdge.target;
								similarityEdge.target.previous = similarityEdge.source;
							}
						}
						similarityEdge.source.forwardEdges.push(similarityEdge);
					});
				});

				backwardSimilarities.forEach( (weightSources,nodeIndex) => {
					weightSources.forEach((weightSource,order) => {
						let similarityEdge = {
							source: currentNodes[weightSource[1]],
							target: nextNodes[nodeIndex],
							weight: weightSource[0],
							match: false,
							backwardOrder: order
						}

						let similarityEdgeName = similarityEdge.source.id+"-"+similarityEdge.target.id;
							
						if(!similarityEdgesByName.hasOwnProperty(similarityEdgeName)){
							this.similarityEdges[boxIndex].push(similarityEdge);	
							similarityEdgesByName[similarityEdgeName] = similarityEdge;
						}else{
							similarityEdge = similarityEdgesByName[similarityEdgeName];
							similarityEdge.backwardOrder = order;
							if(similarityEdge.forwardOrder==0 && similarityEdge.backwardOrder==0){
								similarityEdge.match = true;
								similarityEdge.source.next = similarityEdge.target;
								similarityEdge.target.previous = similarityEdge.source;
							}
						}
						similarityEdge.target.backwardEdges.push(similarityEdge);
					});
				});
				
			}
		}		

		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			let currentNodes = this.nodes[boxIndex];
			currentNodes.forEach(node => { 
				if (!node.timeline) {
					let timeline = {start:boxIndex,nodes:[]};
					let exploredNode = node;
					do{
						exploredNode.timeline = timeline;
						timeline.nodes.push(exploredNode);
						exploredNode = exploredNode.next;
					}while (exploredNode) ;
					this.timelines.push(timeline);
				}
			});
		}

		let timeLinesColors = d3.scaleOrdinal(this.properties.styleColors);

		this.timelines.forEach((timeline,index) => {
			timeline.color = timeLinesColors(index);
		});
		
	}

	stylizeNetworks(){
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			const sizes = this.nodeAttributes[boxIndex]["Size"];
			const sizeScale = this.properties.sizeScale;
			this.displayNodes[boxIndex].forEach(node => {
				node.displaySize = sizeScale*displaySize(sizes?sizes[node.id]:10);
			});

			this.displayEdges[boxIndex].forEach(edge => {
				edge.displayWidth = 0.5*(edge.source.displaySize+edge.target.displaySize)*displayWidth(this.weightScales[boxIndex](edge.weight));
			});

			this.displayNodes[boxIndex].forEach(node => {
				node.displayColor = node.timeline.color;
			});
			
			

			this.nodeElements[boxIndex]
				.attr("r", node => node.displaySize)
				.attr("fill", node => node.displayColor)
				.attr("stroke","none");
			//color
			this.edgeElements[boxIndex]
				.attr("stroke-width", edge => edge.displayWidth)
				.attr("stroke","blue");
		}
	}

	stylizeSimilarities(){
		for (let boxIndex = 0; boxIndex < this.boxCount-1; boxIndex++) {
			const sizeScale = this.properties.sizeScale;

			this.displaySimilarityEdges[boxIndex].forEach(edge => {
				edge.displayWidth = 0.5*(edge.source.displaySize+edge.target.displaySize)*displayWidth(edge.weight);
			});
			
			//color
			this.similarityElements[boxIndex]
				.attr("stroke-width", edge => edge.displayWidth)
				.attr("stroke",d=>d.match?"red":"blue");
		}
	}

	showTitle(nodeID){

	}

	nextStep(){
		this.recalculatePositions();
	}

	recalculatePositions() {
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			this.edgeElements[boxIndex]
				.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y);

			this.nodeElements[boxIndex]
				.attr("cx", d => d.x)
				.attr("cy", d => d.y);
		}

		for (let boxIndex = 0; boxIndex < this.boxCount-1; boxIndex++) {
			this.similarityElements[boxIndex]
				.attr("x1", d => d.source.x)
				.attr("y1", d => d.source.y)
				.attr("x2", d => d.target.x)
				.attr("y2", d => d.target.y);
		}
	}
	
	start(){
		let alpha = 0;
		for (let boxIndex = 0; boxIndex < this.boxCount; boxIndex++) {
			this.simulations[boxIndex]
				.alphaDecay(0.001)
				.velocityDecay(0.005)
				.alphaTarget(alpha)
				.restart();
		}
		this.networkAnimation.start();
	}

	stop(){
		this.networkAnimation.stop();
	}

	redraw(){

	}

	selectNode(node){

	}


}