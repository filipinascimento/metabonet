# Install
First install python 3.8 or above.

Go to the folder where you downloaded this repository. Then install the required packages using the provided `requirements.txt`:

```
pip install -r requirements.txt
```

After installing it you can run the software using the command `python3 metabonet.py`.

# Usage
The package creates a visualization from a `csv` file. Here are the arguments for the software:
```
  -h, --help            show this help message and exit
  -w THRESHOLDSWEIGHT, --thresholdsWeight=THRESHOLDSWEIGHT
                        Threshold range and step separated by commas. Example:
                        0.6,1,0.1
  -b THRESHOLDSBACKBONE, --thresholdsBackbone=THRESHOLDSBACKBONE
                        Set of p-values to use as thresholds for the backbone.
                        Example: 0.01,0.05,0.10
  -s START, --start=START
                        Index of the first column to use as input. Example: 6
  -e END, --end=END     Index of the last column to use as input. (optional)
                        Example: 10
  -i INPUT, --input=INPUT
                        Path to the input CSV file. Example:
                        exampleData/Fed_vs_16hr_fast_signif.csv
  -o OUTPUT, --output=OUTPUT
                        Path to the output folder where the network should be
                        saved. Example: Data
  -S, --serve           Serve results to browser
  -p PORT, --port=PORT  Port to serve results to browser. Example: 8000
```
Example usage:
``` 
python metabonet.py -w 0.6,0.9,0.1 -b 0.05,0.10,0.20 -s 6 -i exampleData/Fed_vs_16hr_fast_signif.csv -o Fed_vs_16hr_fast_signif_network -S -p 8000
```
This will read file `Fed_vs_16hr_fast_signif.csv` and use columns 6 to the end as input as metabolite data. It will create a network for each threshold in the range 0.6 to 0.9 with a step of 0.1. It will also create a backbone network for each p-value in the set 0.05, 0.10 and 0.20. The results will be saved in the folder `Fed_vs_16hr_fast_signif_network`. Finally, it will serve the results to the browser at port 8000.



