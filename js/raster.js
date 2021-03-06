(function() {
  ruleRaster = {};
  var width, height,
		chart, svg,
		defs, style;
  ruleRaster.init = function(params) {
    if (!params) {params = {};}

    chart = d3.select(params.chart || '#chart'); // placeholder div for svg
    margin = {top: 50, right: 10, bottom: 40, left: 300};
    padding = {top: 40, right: 40, bottom: 40, left: 40};
    var outerWidth = params.width || 960,
			outerHeight = params.height || 500,
			innerWidth = outerWidth - margin.left - margin.right,
			innerHeight = outerHeight - margin.top - margin.bottom;
    width = innerWidth - padding.left - padding.right;
    height = innerHeight - padding.top - padding.bottom;
    chart = chart.selectAll('svg')
      .data([{width: width + margin.left + margin.right, height: height + margin.top + margin.bottom}]);
    chart.enter()
     .append('svg');
    chart.exit()
         .remove();
    svg = chart.attr({
      width: function(d) {return d.width + margin.left + margin.right;},

      height: function(d) {return d.height + margin.top + margin.bottom;}
    })
			.append('g')
        .attr('transform', 'translate(' + margin.left + ',' + margin.top + ')');

    // ruleRaster.init can be re-ran to pass different height/width values
    // to the svg. this doesn't create new svg elements.
    style = svg.selectAll('style').data([{}]).enter()
			.append('style')
        .attr('type', 'text/css');

    // this is where we can insert style that will affect the svg directly.
    defs = svg.selectAll('defs').data([{}]).enter()
			.append('defs');

    // Load Data
    ruleRaster.loadData(params);
  };

  ruleRaster.loadData = function(params) {
    if (!params) {params = {};}

    d3.text(params.style || 'style.txt', function(error, txt) {
      // note that execution won't be stopped if a style file isn't found
      // ('#' + Math.random()) makes sure the script loads the file each time instead of using a cached version, remove once live
      var curFileName = 'DATA/' + params.curFile  + '.json' + '#' + Math.random();
      d3.json(curFileName, function(error, json) {
        style.text(txt); // but if found, it can be embedded in the svg.

        // Resize height so that spikes are large enough to see
        var numTrials = json[params.curFile].neurons[0].Number_of_Trials;
        chart.attr('height', 4 * numTrials + margin.top + margin.bottom);
        height = 4 * numTrials;
        ruleRaster.data = json;

        // populate drop-down menu with neuron names
        var neuronMenu = d3.select('#neuronMenu');
        neuronMenu.selectAll('select.main').data([{}]).enter()
          .append('select')
            .attr('name', 'neuron-list')
            .classed('main', 1);
        var	neuron = ruleRaster.data[params.curFile].neurons;
        var neuronOptions = neuronMenu.select('select').selectAll('option').data(neuron, function(d) {return d.Name;});

        neuronOptions.enter()
					.append('option')
            .text(function(d) {return d.Name;})
            .attr('value', function(d) {return d.Name;});

        neuronOptions.exit()
          .remove();
        var curNeuron = params.curNeuron || ruleRaster.data[params.curFile].neurons[0].Name;
        neuronOptions
          .filter(function(d) {
            return d.Name == curNeuron;})
          .attr('selected', 'selected');

        var fileMenu = d3.selectAll('#fileMenu');
        var fileOptions = fileMenu.select('select').selectAll('option');
        fileOptions
          .filter(function(d) {
              return d3.select(this).property('value') == params.curFile;
            })
            .attr('selected', 'selected');
        timeMenu = d3.selectAll('#timeMenu');
        timeOptions = timeMenu.select('select').selectAll('option');
        timeOptions
          .filter(function(d) {
              return d3.select(this).property('value') == params.curTime;
            })
            .attr('selected', 'selected');

        // Draw visualization
        ruleRaster.draw(params);
      });
    });
  };

  ruleRaster.draw = function(params) {
    // Tool Tip - make a hidden div to appear as a tooltip when mousing over a line
    toolTip = d3.select('body').selectAll('div#tooltip').data([{}]);
    toolTip.enter()
      .append('div')
        .attr('id', 'tooltip')
        .style('opacity', 1e-6);

    // Extract relevant trial and neuron information
    var neuronMenu = d3.select('#neuronMenu select');
    var curNeuronName = neuronMenu.property('value');
    var timeMenu = d3.select('#timeMenu select');
    var timeMenuValue = timeMenu.property('value');
    var fileMenu = d3.selectAll('#fileMenu');
    var factorSortMenu = d3.select('#factorSortMenu select');
    var factorSortMenuValue = params.curFactor || factorSortMenu.property('value');
    var neuron = ruleRaster.data[params.curFile].neurons
        .filter(function(d) {
          return d.Name === curNeuronName;
        });

    window.history.pushState({}, '', '/RasterVis/index.html?curFile=' + params.curFile +
                                                          '&curNeuron=' + curNeuronName +
                                                          '&curTime=' + timeMenuValue +
                                                          '&curFactor=' + factorSortMenuValue);

    // Nest and Sort Data
    if (factorSortMenuValue != 'Name') {
      var factor = d3.nest()
          .key(function(d) {return d[factorSortMenuValue];}) // nests data by selected factor
              .sortValues(function(a, b) { // sorts values based on Rule
                return d3.ascending(a.Rule, b.Rule);
              })
          .entries(ruleRaster.data[params.curFile].trials);
    } else {
      var factor = d3.nest()
          .key(function(d) {return d[factorSortMenuValue];}) // nests data by selected factor
            .sortValues(function(a, b) { // sorts values based on trial
              return d3.ascending(a.trial_id, b.trial_id);
            })
          .entries(ruleRaster.data[params.curFile].trials);
    }

    // Compute variables for placing plots (plots maintain constant size for each trial)
    var PLOT_BUFFER = 0;
    var factorLength = factor.map(function(d) {return d.values.length;});

    var factorRangeBand = factorLength.map(function(d) {return (height + (factorLength.length * -PLOT_BUFFER)) * (d / d3.sum(factorLength))});

    var factorPoints = [0];
    factorRangeBand.forEach(function(d, i) {
      factorPoints[i + 1] = factorPoints[i] + d + PLOT_BUFFER;
    });

    factorPoints = factorPoints.slice(0, factorPoints.length - 1);

    // Create a group element for each rule so that we can have two plots, translate plots so that they don't overlap
    var plotG = svg.selectAll('g.plotG')
      .data(factor, function(d) {return d.key;});

    plotG.exit()
          .remove();
    plotG.enter()
      .append('g')
        .attr('class', 'plotG')
        .attr('id', function(d) {return d.key;});

    plotG.attr('transform', function(d, i) {
          return 'translate(0,' + factorPoints[i] + ')';
        });

    // Append a y-scale to each plot so that the scale is adaptive to the range of each plot
    plotG
     .each(function(d, i) {
       d.yScale = d3.scale.ordinal()
         .domain(d3.range(d.values.length))
         .rangeBands([0, factorRangeBand[i]]);
     });

    // Set up x-scale, colorScale to be the same for both plots
    var	minTime = d3.min(ruleRaster.data[params.curFile].trials, function(d) {
      return d.start_time - d[timeMenuValue];
    });

    var maxTime = d3.max(ruleRaster.data[params.curFile].trials, function(d) {
      return d.end_time - d[timeMenuValue];
    });

    var xScale = d3.scale.linear()
      .domain([minTime - 10, maxTime + 10])
			.range([0, width]);

    var	colorScale;
    if (params.color != 'Neutral') {
      colorScale = d3.scale.ordinal()
        .domain(['Color', 'Orientation'])
        .range(['#ef8a62', '#67a9cf']);
    } else {
      colorScale = d3.scale.ordinal()
        .domain(['Color', 'Orientation'])
        .range(['black', 'black']);
    }

    // Draw spikes, event timePeriods, axes
    updateNeuralInfo();
    plotG.each(drawSpikes);
    appendAxis();

    // Listen for changes on the drop-down menu
    factorSortMenu.on('change', function() {
      svg.selectAll('.eventLine').remove();
      params.curFactor = d3.selectAll('#factorSortMenu select').property('value');
      ruleRaster.draw(params);
    });

    neuronMenu.on('change', function() {
      ruleRaster.draw(params);
    });

    timeMenu.on('change', function() {
      params.curTime = d3.selectAll('#timeMenu select').property('value');
      ruleRaster.draw(params);
    });

    fileMenu.on('change', function() {
      svg.selectAll('.eventLine').remove();
      params.curFile = d3.selectAll('#fileMenu select').property('value');
      ruleRaster.loadData(params);
    });

    // ******************** Axis Function *******************
    function appendAxis() {
      var xAxis = d3.svg.axis()
        .scale(xScale)
        .orient('top')
        .ticks(10)
        .tickSize(0)
        .tickFormat(d3.format('4d'));

      // Append the x-axis
      var xAxisG = svg.selectAll('g.xAxis').data([{}]);
      xAxisG.enter()
        .append('g')
          .attr('class', 'xAxis');
      xAxisG
        .transition()
          .duration(10)
          .ease('linear')
          .call(xAxis);
    }

    // ******************** Helper Functions **********************

    // ******************** Draw Spikes Function ******************
    function drawSpikes(data, ind) {
      if (data.key === 'null') {
        return;
      }

      var curPlot = d3.select(this);
      var backgroundLayer = curPlot.selectAll('g.backgroundLayer').data([{}]);
      backgroundLayer.enter()
        .append('g')
          .attr('class', 'backgroundLayer');
      var trialLayer = curPlot.selectAll('g.trialLayer').data([{}]);
      trialLayer.enter()
        .append('g')
          .attr('class', 'trialLayer');
      var curPlotRect = backgroundLayer.selectAll('rect.background').data([{}]);
      curPlotRect.enter()
        .append('rect')
          .attr('class', 'background');
      curPlotRect
        .attr('x', -10)
        .attr('y', 0)
        .attr('width', width + 10)
        .attr('height', factorRangeBand[ind]);
      drawEventLines(data, ind);

      // Join the trial data to svg containers ('g')
      var	trialG = trialLayer.selectAll('.trial').data(data.values, function(d) {return d.trial_id + params.curFile;});

      // Remove trials that don't have matched data
      trialG.exit()
        .remove();

      // For each new data, append an svg container and set css class to trial
      // for each group, translate its location to its index location in the trial object
      trialG.enter()
        .append('g')
          .attr('class', 'trial')
          .attr('transform', function(d, i) {
            return 'translate(0,' + data.yScale(i) + ')';
          });

      trialG
        .style('fill', function(d) {
          return colorScale(d.Rule);
        })
        .attr('transform', function(d, i) {
          return 'translate(0,' + data.yScale(i) + ')';
        });

      // For each new spike time, append circles that correspond to the spike times
      // Set the x-position of the circles to their spike time and the y-position to the size of the ordinal scale range band
      // that way the translate can move them to their appropriate position relative to the same coordinate system
      var spikes = trialG.selectAll('circle.spikes').data(function(d) {return d[curNeuronName];});

      spikes.exit()
        .transition()
          .duration(1000)
          .style('opacity', 1E-5)
        .remove();
      spikes.enter()
        .append('circle')
          .attr('class', 'spikes')
          .style('opacity', 1E-5);
      spikes
        .transition()
          .duration(1000)
          .attr('cx', function(d) {
            return xScale(d - (this.parentNode.__data__[timeMenuValue]));
          })
          .style('opacity', 1)
          .attr('r', data.yScale.rangeBand() / 2)
          .attr('cy', data.yScale.rangeBand() / 2);

      // Append invisible box for mouseover
      var mouseBox = trialG.selectAll('rect.trialBox').data(function(d) {return [d];});

      mouseBox.exit()
        .remove();
      mouseBox.enter()
        .append('rect')
          .attr('class', 'trialBox');
      mouseBox
        .attr('x', function(d) {
          if (d.start_time != null) {
            return xScale(d.start_time - d[timeMenuValue]);
          } else {return 0;}
        })
        .attr('y', 0)
        .attr('width', function(d) {
          if (d.start_time != null) {
            return (xScale(d.end_time - d[timeMenuValue])) - (xScale(d.start_time - d[timeMenuValue]));
          } else {return width;}
        })
        .attr('height', data.yScale.rangeBand())
        .attr('opacity', '1e-9')
        .on('mouseover', mouseBoxOver)
        .on('mouseout', mouseBoxOut);

      // Y axis labels
      var yAxisG = curPlot.selectAll('g.yAxis').data([data.key]);
      yAxisG.enter()
        .append('g')
          .attr('class', 'yAxis')
          .attr('transform', 'translate(-10,0)');
      yAxisG.exit()
        .remove();
      var yAxis = d3.svg.axis()
        .scale(data.yScale)
        .orient('left')
        .tickValues(data.yScale.domain().filter(function(d, i) {
          return false;
        }))
        .tickSize(-10);
      yAxisG
        .call(yAxis);
      var yAxisLabel = yAxisG.selectAll('text.yLabel').data([factorSortMenuValue + ': ' + data.key]);
      yAxisLabel.enter()
        .append('text')
          .attr('class', 'yLabel')
          .attr('text-anchor', 'end');
      switch (factorSortMenuValue) {
        case 'Name':
          yAxisLabel
            .attr('x', 0)
            .attr('y', -3)
            .attr('transform', 'rotate(-90)')
            .text('← Trials ')
          break;
        case 'Reaction_Time':
        case 'Preparation_Time':
          yAxisLabel
            .attr('x', 0)
            .attr('dx', -0.4 + 'em')
            .attr('transform', 'rotate(0)')
            .attr('y', factorRangeBand[ind] / 2)
            .attr('text-anchor', 'end')
            .text(function() {
              if (+data.key % 10 == 0) {
                return fixDimNames(factorSortMenuValue) + ': ' + data.key + ' ms';
              } else {return '';}
            });

          break;
        default:
          yAxisLabel
            .attr('x', 0)
            .attr('dx', -0.4 + 'em')
            .attr('transform', 'rotate(0)')
            .attr('y', 0)
            .attr('y', 1 + 'em')
            .attr('text-anchor', 'end')
            .text(function(d) {return fixDimNames(d);})

          break;
      }
      function mouseBoxOver(d) {
        // Pop up tooltip
        toolTip
          .style('opacity', 1)
          .style('left', (d3.event.pageX + 10) + 'px')
          .style('top', (d3.event.pageY + 10) + 'px')
          .html(function() {
            return '<b>Trial ' + d.trial_id + '</b><br>' +
                   '<table>' +
                   '<tr><td>' + 'Rule:' + '</td><td><b>' + d.Rule + '</b></td></tr>' +
                   '<tr><td>' + 'Rule Repetition:' + '</td><td><b>' + d.Rule_Repetition + '</b></td></tr>' +
                   '<tr><td>' + 'Preparation Time:' + '</td><td><b>' + d.Preparation_Time + ' ms' + '</b></td></tr>' +
                   '<tr><td>' + 'Congruency:' + '</td><td><b>' + d.Current_Congruency + '</b></td></tr>' +
                   '<tr><td>' + 'Response Direction:' + '</td><td><b>' + d.Response_Direction + '</b></td></tr>' +
                   '<tr><td>' + 'Reaction Time:' + '</td><td><b>' + d.Reaction_Time + ' ms' + '</b></td></tr>' +
                   '<hr>' +
                   '<tr><td>' + 'Correct?:' + '</td><td><b>' + d.isCorrect + '</b></td></tr>' +
                   '<tr><td>' + 'Fixation Break?:' + '</td><td><b>' + d.Fixation_Break + '</b></td></tr>' +
                   '<tr><td>' + 'Error on previous trial?:' + '</td><td><b>' + d.Previous_Error + '</b></td></tr>' +
                   '<tr><td>' + 'Included in Analysis?:' + '</td><td><b>' + d.isIncluded + '</b></td></tr>' +
                   '</table>';
          });

        var curMouseBox = d3.select(this);
        curMouseBox
          .attr('stroke', 'black')
          .attr('fill', 'white')
          .attr('opacity', 1)
          .attr('fill-opacity', 1e-9);
      }

      function mouseBoxOut(d) {
        // Hide tooltip
        toolTip
          .style('opacity', 1e-9);
        var curMouseBox = d3.select(this);
        curMouseBox
          .attr('opacity', 1e-9);
      }

      // ******************** Event Line Function *******************
      function drawEventLines(data, ind) {
        var timePeriods = [
          {label: '<br>ITI', id1: 'start_time', id2: 'fixation_onset', color: '#c5b0d5'},
          {label: '<br>Fix.', id1: 'fixation_onset', id2: 'rule_onset', color: '#f7b6d2'},
          {label: '<br>Rule', id1: 'rule_onset', id2: 'stim_onset', color: '#98df8a'},
          {label: 'Test<br>Stimulus', id1: 'stim_onset', id2: 'react_time', color:  '#ff9896'},
          {label: '<br>Saccade', id1: 'react_time', id2: 'reward_time', color: '#9edae5'},
          {label: '<br>Reward', id1: 'reward_time', id2: 'end_time', color:  '#c49c94'}
        ];
        var eventLine = backgroundLayer.selectAll('path.eventLine').data(timePeriods, function(d) {return d.label;});

        eventLine.exit()
          .remove();

        // Append mean times for label position
        timePeriods = timePeriods.map(function(d) {
          // if timePeriod value is null, find the next non-null trialß
          var dataInd = 0;
          while (data.values[dataInd][d.id1] == null) {
            dataInd++;
          }

          return {
            label: d.label,
            id1: d.id1,
            id2: d.id2,
            labelPosition: data.values[dataInd][d.id1] - data.values[dataInd][timeMenuValue],
            color: d.color
          };
        });

        var valuesInd = d3.range(data.values.length);
        var newValues = data.values.concat(data.values);
        valuesInd = valuesInd.concat(valuesInd);
        newValues = newValues.map(function(d, i) {
          d.sortInd = valuesInd[i];
          return d;
        });

        newValues.sort(function(a, b) {
          return d3.ascending(a.sortInd, b.sortInd);
        });

        // Plot timePeriods corresponding to trial events
        eventLine.enter()
          .append('path')
            .attr('class', 'eventLine')
            .attr('id', function(d) {return d.label;})
            .attr('opacity', 1E-6)
            .attr('fill', function(d) {return d.color;});

        eventLine
          .transition()
            .duration(1000)
            .ease('linear')
            .attr('opacity', 0.90)
            .attr('d', function(timePeriod) {
              return AreaFun(newValues, timePeriod);
            });

        // Add labels corresponding to trial events
        var eventLabel = svg.selectAll('.eventLabel').data(timePeriods, function(d) {return d.label;});

        if (ind == 0) {
          eventLabel.enter()
            .append('foreignObject')
              .attr('class', 'eventLabel')
              .attr('id', function(d) {return d.label;})
              .attr('y', -50)
              .attr('width', 45)
              .attr('height', 33)
              .style('color', function(d) {return d.color;})
              .html(function(d) {return '<div>' + d.label + '<br>▼</div>'; });

          eventLabel
            .attr('x', function(d) {
              return (xScale(d.labelPosition) - 22.5) + 'px';
            });
        }

        function AreaFun(values, timePeriod) {
          // Setup helper line function
          var area = d3.svg.area()
            .defined(function(d) {
              return d[timePeriod.id1] != null && d[timePeriod.id2] != null && d[timeMenuValue] != null;
            }) // if null, suppress line drawing
            .x0(function(d) {
              return xScale(d[timePeriod.id1] - d[timeMenuValue]);
            })
            .x1(function(d) {
              return xScale(d[timePeriod.id2] - d[timeMenuValue]);
            })
            .y(function(d, i) {
              if (i % 2 == 0) {
                return data.yScale(d.sortInd);
              } else {
                return data.yScale(d.sortInd) + data.yScale.rangeBand();
              }
            })
            .interpolate('linear');
          return area(values);
        }
      }
    }

    // ******************** Neuron Info Function *******************
    function updateNeuralInfo() {
      var atGlance = d3.select('#atGlance').selectAll('table').data(neuron, function(d) {return d.Name;});

      // Display neuron info
      atGlance.enter()
        .append('table')
          .append('tbody');
      var tbody = atGlance.selectAll('tbody');
      var tr = tbody.selectAll('tr').data(d3.keys(neuron[0]), String);
      tr.enter()
        .append('tr')
          .append('th')
            .text(String);
      tr.selectAll('td').data(function(d) {
        return neuron.map(function(column) {
          return {key: d, value: column[d]};
        });
      })
      .enter()
        .append('td')
          .text(function(d) {return d.value;});

      atGlance.exit()
        .remove();
    }
  };

  // Replaces underscores with blanks and 'plus' with '+'
  function fixDimNames(dimName) {
    var pat1 = /plus/;
    var pat2 = /_/g;
    var pat3 = /minus/;
    var fixedName = dimName.replace(pat1, '+').replace(pat2, ' ').replace(pat3, '-');
    return fixedName;
  }
})();
