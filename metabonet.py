import numpy as np
import igraph as ig
import xnetwork as xn
from pathlib import Path
from tqdm.auto import tqdm
import leidenalg as la
import igraph as ig
import pandas as pd
import json
from mpmath import mp # pip install mpmath
from scipy import integrate
from functools import partial

mp.dps = 50



repetitions = 10
trials = 100
thresholdsWeight = np.linspace(0.6,1,41)
thresholdsBackbone = np.array([0.05,0.10,0.3])

start = 6
end = None


inputCSVPath = "exampleData/Fed_vs_16hr_fast_signif.csv"
outputPath = "Data"


#servePage will serve the rootPath to the browser
def servePage(port,rootPath):
    print("Serving results", rootPath, "to browser at port",port)
    import http.server
    import socketserver
    import webbrowser
    import threading

    PORT = port
    Handler = partial(http.server.SimpleHTTPRequestHandler,directory=rootPath)
    httpd = socketserver.TCPServer(("", PORT), Handler)
    print("serving at port", PORT)
    domain="localhost"


    threading.Timer(1.25, lambda: webbrowser.open("http://"+domain+":"+str(PORT))).start()
    httpd.serve_forever()

     
# get thresholdsWeight, thresholdsBackbone, start, end (optional), input and output paths from arguments
import optparse
parser = optparse.OptionParser()
parser.add_option('-w', '--thresholdsWeight', dest='thresholdsWeight', default=None, help='Threshold range and step separated by commas. Example: 0.6,1,0.1')
parser.add_option('-b', '--thresholdsBackbone', dest='thresholdsBackbone', default=None, help='Set of p-values to use as thresholds for the backbone. Example: 0.01,0.05,0.10')
parser.add_option('-s', '--start', dest='start', default=None, help='Index of the first column to use as input. Example: 6')
parser.add_option('-e', '--end', dest='end', default=None, help='Index of the last column to use as input. (optional) Example: 10')
parser.add_option('-i', '--input', dest='input', default=None, help='Path to the input CSV file. Example: exampleData/Fed_vs_16hr_fast_signif.csv')
parser.add_option('-o', '--output', dest='output', default=None, help='Path to the output folder where the network should be saved. Example: Data')
# serve results to browser with -S and -p to select port
parser.add_option('-S', '--serve', dest='serve', default=False, action="store_true", help='Serve results to browser')
parser.add_option('-p', '--port', dest='port', default=8000, help='Port to serve results to browser. Example: 8000')
(options, args) = parser.parse_args()

if(options.thresholdsWeight is not None):
    thresholdsWeight = np.arange(*np.array(options.thresholdsWeight.split(","),dtype=float))
if(options.thresholdsBackbone is not None):
    thresholdsBackbone = np.array(options.thresholdsBackbone.split(","),dtype=float)
if(options.start is not None):
    start = int(options.start)
if(options.end is not None):
    end = int(options.end)
if(options.input is not None):
    inputCSVPath = Path(options.input)
else:
    if(options.output is not None and options.serve):
        servePage(int(options.port),Path(options.output))
        import sys
        sys.exit()
    else:
        raise ValueError("Input path not specified")
if(options.output is not None):
    outputPath = Path(options.output)
else:
    raise ValueError("Output path not specified")


# get file name without extension
networkName = inputCSVPath.stem
networksPath = outputPath/"Networks"

outputPath.mkdir(parents=True,exist_ok=True)
networksPath.mkdir(parents=True,exist_ok=True)

# Uncompress metabolites_net.tar.gz from the package directory to outputPath
# sh command to compress directory metabolites_net to metabolites_net.tar.gz
# !tar -C metabolites_net --disable-copyfile -zcvf metabolites_net.tar.gz ./
import tarfile
import shutil
#get tarPath
tarPath = Path(__file__).parent/"metabolites_net.tar.gz"

with tarfile.open(tarPath, "r:gz") as tar:
    tar.extractall(outputPath)


def disparity_filter(g,weights="weight"):
	total_vtx = g.vcount()
	g.es['alpha_ij'] = 1

	for v in range(total_vtx):
		edges = g.incident(v)

		k = len(edges)
		if k > 1:
			sum_w = mp.mpf(sum([g.es[e][weights] for e in edges]))
			for e in edges:
				w = g.es[e][weights]
				p_ij = mp.mpf(w)/sum_w
				alpha_ij = 1 - (k-1) * integrate.quad(lambda x: (1-x)**(k-2), 0, p_ij)[0]
				g.es[e]['alpha_ij'] = min(alpha_ij,g.es[e]['alpha_ij'])

def alpha_cut(alpha,g):
	g_copy = g.copy()
	to_delete = g_copy.es.select(alpha_ij_ge=alpha)
	g_copy.delete_edges(to_delete)
	return g_copy

def leiden_find_partition_multiplex(graphs, partition_type, layer_weights=None, seed=None, **kwargs):
    """ Detect communities for multiplex graphs.
    Each graph should be defined on the same set of vertices, only the edges may
    differ for different graphs. See
    :func:`Optimiser.optimise_partition_multiplex` for a more detailed
    explanation.
    Parameters
    ----------
    graphs : list of :class:`ig.Graph`
            List of :class:`leiden.VertexPartition` layers to optimise.
    partition_type : type of :class:`MutableVertexPartition`
            The type of partition to use for optimisation (identical for all graphs).
    seed : int
            Seed for the random number generator. By default uses a random seed
            if nothing is specified.
    **kwargs
            Remaining keyword arguments, passed on to constructor of ``partition_type``.
    Returns
    -------
    list of int
            membership of nodes.
    float
            Improvement in quality of combined partitions, see
            :func:`Optimiser.optimise_partition_multiplex`.
    Notes
    -----
    We don't return a partition in this case because a partition is always
    defined on a single graph. We therefore simply return the membership (which
    is the same for all layers).
    See Also
    --------
    :func:`Optimiser.optimise_partition_multiplex`
    :func:`slices_to_layers`
    Examples
    --------
    >>> n = 100
    >>> G_1 = ig.Graph.Lattice([n], 1)
    >>> G_2 = ig.Graph.Lattice([n], 1)
    >>> membership, improvement = leiden.find_partition_multiplex([G_1, G_2],
    ...                                                            leiden.ModularityVertexPartition)
    """
    n_layers = len(graphs)
    partitions = []
    if(layer_weights is None):
        layer_weights = [1]*n_layers
    for graph in graphs:
        partitions.append(partition_type(graph, **kwargs))
    optimiser = la.Optimiser()

    if (not seed is None):
        optimiser.set_rng_seed(seed)

    improvement = optimiser.optimise_partition_multiplex(
        partitions, layer_weights)
    return partitions[0].membership, improvement


def LeidenModularity(aNetwork,weight = None):
    partition = la.find_partition(
        aNetwork, la.ModularityVertexPartition,weights=weight)
    return partition.quality(),partition.membership

def calculateMaxModularity(g, trials=100, weight= None):
    maxModularity = -1
    bestMembership = None
    for _ in range(trials):
        modularity,membership = LeidenModularity(g,weight=weight)
        if(modularity > maxModularity):
            maxModularity = modularity
            bestMembership = membership
    return maxModularity,bestMembership

networkData = {}
dataset = pd.read_csv(inputCSVPath)
groupData = dataset
values = groupData[groupData.columns[start:end]].to_numpy().T
labels = groupData.columns[start:end].to_list()
correlations = np.corrcoef(values)
np.fill_diagonal(correlations, 0)
correlations[~np.isfinite(correlations)] = 0
# percentile = 50
gOriginal = ig.Graph.Weighted_Adjacency(correlations, mode='upper', attr='weight')

for thresholdWeight in tqdm(thresholdsWeight,leave=False):
    for thresholdBackbone in tqdm(thresholdsBackbone,leave=False):
        tsd = {}
        g = gOriginal.copy()
        
        indices = set(np.where(np.abs(g.es["weight"])<thresholdWeight)[0])
        
        g.es["weight_abs"] = np.abs(g.es["weight"])
        disparity_filter(g,weights="weight_abs")
        indices.update(np.where(g.es["alpha_ij"]>thresholdBackbone)[0])
        
        g.delete_edges(list(indices))
        if(g.ecount()==0):
            # print("Skipping empty graph",networkName,thresholdWeight,thresholdBackbone)
            continue;

        g.es["weight"] = g.es["weight"]
        g.vs["Label"] = labels
        # print("Detecing layered communities")
        network_pos = g.subgraph_edges(
            g.es.select(weight_gt=0), delete_vertices=False)
        network_neg = g.subgraph_edges(
            g.es.select(weight_lt=0), delete_vertices=False)
        network_neg.es['weight'] = [-w for w in network_neg.es['weight']]
        layerNetworks = [network_pos, network_neg]
        layerWeights = [1, -1]
        layerNames = ["positive", "negative"]
        modularityWeights = layerWeights
        partitionFunction = la.ModularityVertexPartition
        layerSizes = [g.ecount() for g in layerNetworks]
        allCount = np.sum(layerSizes)
        modularityWeights = [layerWeights[layerIndex]*layerSizes[layerIndex] /
                                allCount for layerIndex in range(len(layerWeights))]
        modularityWeights[0] = 1.0
        membership, improv = leiden_find_partition_multiplex(layerNetworks, partitionFunction,
                                                    layer_weights=modularityWeights, weights="weight")
        g.vs["Leiden Layered"] = membership
        # print("Detecing SBM communities")
        # g.vs["SBM"], tsd["DLDetected"], tsd["DLTrivial"] = SBMMinimizeMembership(layerNetworks[0])
        
        
        
        # print("Detecing Weighted SBM communities")
        # g.vs["SBM Weighted"], tsd["DLDetectedWeighted"], tsd["DLTrivialWeighted"] = SBMMinimizeMembershipWeighted([layerNetworks[0]])

        # print("Detecing Layered SBM communities")
        # g.vs["membershipSBMLayered"], tsd["DLDetectedLayered"], tsd["DLTrivialLayered"] = SBMMinimizeMembershipWeighted(layerNetworks, layerWeights=layerWeights)

        # print("Detecing Max modularity")
        tsd["maxModularity"], g.vs["Leiden"] = calculateMaxModularity(layerNetworks[0])
        tsd["maxModularityWeighted"], g.vs["Leiden Weighted"] = calculateMaxModularity(layerNetworks[0],weight="weight")


        
        g.vs["Leiden"] = [str(value) for value in g.vs["Leiden"]]
        g.vs["Leiden Layered"] = [str(value) for value in g.vs["Leiden Layered"]]
        g.vs["Leiden Weighted"] = [str(value) for value in g.vs["Leiden Weighted"]]
        # g.vs["SBM"] = [str(value) for value in g.vs["SBM"]]
        # g.vs["SBM Weighted"] = [str(value) for value in g.vs["SBM Weighted"]]
        
    

        g_positive = g.subgraph_edges(
            g.es.select(weight_gt=0), delete_vertices=False)
        # remove nodes with no edges
        g_positive.delete_vertices(np.where(np.array(g_positive.degree())==0)[0])
        xn.igraph2xnet(g_positive,str((networksPath/("mixed_net_%s_correlation_W%.5g_B%.5g_pos.xnet"%(networkName,thresholdWeight,thresholdBackbone))).resolve()))
        tsd["networkName"] = networkName
        tsd["thresholdWeight"] = thresholdWeight
        tsd["thresholdBackbone"] = thresholdBackbone
        networkData[("mixed_net_%s_correlation_W%.5g_B%.5g_pos.xnet"%(networkName,thresholdWeight,thresholdBackbone))] = tsd

with open(str((outputPath/("networkData.json")).resolve()), "w") as f:
    json.dump(networkData, f, indent=4)

if(options.serve): 
    servePage(int(options.port),Path(options.output))

# !tar -C metabolites_net --disable-copyfile -zcvf metabolites_net.tar.gz ./