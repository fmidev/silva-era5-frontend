      var myChart; // global variable for chart
      $(function(){
        $(".dropdown-menu li a").click(function(){
          $(".btn:first-child").text($(this).text());
          $(".btn:first-child").val($(this).text());
        });

      });

      $("#era .write").change(function() {
        $("#era").data("changed",true);
      });

      $('#queryButton').on('click', function (e) {
        if ($("#era").data("changed") == false) {
          var accumulated = JSON.parse(sessionStorage.getItem('data'));
          var filtered = filterData(accumulated);
          updateChart(filtered);
          updateTable(filtered, Object.keys(accumulated[0]).map(function(prop) { return prop; }));
          return;
        }


        $(".progress-bar").css('width', '0%').attr('aria-valuenow', 0);
        $(".progress").show();

        var paramstr = "";
        for (var i = 0; i < 4; i++) {
          if ($("#inputParameter" + i).length == 0) { break; }
          var param = $("#inputParameter" + i).val();
          var filter = $("#inputParameter" + i + "Condition").val();

          if (param != "none") {
            if (filter != "none") {
                var filterValue = $("#inputParameter" + i + "ConditionValue").val();
                param = getFilterForParam(param, filter, filterValue);
            }
            if (param == "RR-24-KGM2") {
              paramstr += ",sum_t(RRR-KGM2/24h)";
            } else if (param == "SN-24-KGM2") {
              paramstr += ",sum_t(SNR-KGM2/24h)";
            } else {
              paramstr += "," + param;
            }
          }
        }

        //var domain = $("#domain0").val().replace(/\s+/g, '');

        var domainstr = '';
        for (var i = 0; i < 4; i++) {
          var val = $("#domain" + i).val();
          if (val === undefined) { break; }

          if (i > 0) domainstr += ',';
          domainstr += val;
        }

        if (paramstr == "" || domainstr == "") {
          return;
        }

        
        var expand = function(dstr) {
          var ret = []
          var elems = dstr.split(',');
          for (var i = 0; i < elems.length; i++) {
            if (elems[i].toString().search("-") >= 0) {
              var range = elems[i].split('-');
              for (var j = range[0]; j <= range[1]; j++) {
                ret.push(parseInt(j));
              }
            } else {
              ret.push(parseInt(elems[i]));
            }
          }
          return ret;
        };

        var clamp = function(y,m,d) {
          var dim = new Date (y,m,0).getDate();
          var dd = d.filter(function (day) {
            return day <= dim;
          });
          return [y,m,dd];
        }

        var years = expand($("#selectedYears").val());
        var months = expand($("#selectedMonths").val());
        var days = expand($("#selectedDays").val());

        var dates = [];
        var accumulated = []; // this is where we collect the full data 
                              // as it's fetched from server

        years.forEach(y => 
          months.forEach(m => 
            dates.push(clamp(y, m, days))
          )
        );

        var proglen = dates.length + 1;

        $(".progress-bar").css('width', (100 / proglen) + "%").attr('aria-valuenow', 1 / (proglen));

        function finalize() {

          window.setTimeout(function() {
            $(".progress").hide();
          }, 500);
          var filtered = filterData(accumulated);
          updateChart(filtered);
          updateTable(filtered, Object.keys(accumulated[0]).map(function(prop) { return prop; }));
          store(accumulated);
          $("#era").data("changed",false);
        }

        var callNum = 1;
        function getDataRecursive() {
          if (dates.length == 0) { 
            finalize(); 
            return;
          }

          var curdate = dates.shift();
          $.getJSON(getDataUrl(domainstr, paramstr, curdate), function(data){
            accumulated = accumulated.concat(data);
            callNum++;
            $(".progress-bar").css('width', (100 * (callNum / proglen)) + "%").attr('aria-valuenow', callNum / proglen);
    
            getDataRecursive();
          });
        }

        getDataRecursive();

      });

      function getDataUrl(domain, paramstr, ts) {
        var api_url = "http://archive.nest.fmi.fi/timeseries?";

        var year = ts[0];
        var month = ts[1];
        var days = ts[2];
        var beginDate = year + "" + pad(month) + "" + pad(days[0]) + "000000";
        var endDate = year + "" + pad(month) + "" + pad(days[days.length-1]) + "230000";

        var url = api_url + "format=json&tz=utc&timeformat=xml&precision=double&missingtext=null"+
           "&areas="+domain+"&param=name,time"+paramstr+"&starttime="+beginDate+
           "&endtime="+endDate;

        console.log(url);

        return url;
      }

      function removeNulls(arr) {
        return arr.filter(function (elem) { return elem != null; })
      }

      function preprocess(data) {

        var findFiltered = function(list, domain) {
          for (var i = 0; i < list.length; i++) {
            if (list[i].domain == domain) { return list[i]; }
					}
				  list.push({ x: [], y: [], domain: domain });
					return list[list.length - 1];
				};

        var findParamData = function(filtered, param) {
          for (var i = 0; i < filtered.y.length; i++) {
            if (filtered.y[i].label == param) { return filtered.y[i]; }
					}
				  filtered.y.push({ 'label' : param, 'data': [] });
					return filtered.y[filtered.y.length - 1];
				};

        var filteredList = []
        var filtered = null; //findFiltered(filteredList, null); //{ x: null, y: [], domain: null};
        var areaMerge = $('#areaMerge').is(':checked');

        var paramNames = Object.keys(data[0])
        for (var i = 2; i < paramNames.length; i++) {
          var param = paramNames[i];
          var paramData = null;
          var labels = null;
          var domain = "";

          for (var j = 0; j < data.length; j++) {
            domain = data[j]['name'];

            if (filtered === null) {
              filtered = findFiltered(filteredList, domain);
            }

            labels = filtered.x;

            if (paramData === null) {
              paramData = findParamData(filtered, param);
            }
            if (areaMerge && filtered['domain'].search(domain) == -1) {
              filtered['domain'] += "," + domain
            }

            if (!areaMerge && filtered['domain'] !== null && filtered['domain'] != domain) {
              // Area has changed, start a new dataset or use an older one if exists
              filtered = findFiltered(filteredList, domain) //{ x: null, y: [], domain: domain};
              paramData = findParamData(filtered, param)
              labels = filtered.x;
            }

            var current = data[j][param];
            var parsed = null;

            if (current === null || current == "null") {
              parsed = [];
            } else if (typeof(current) == "string") {
              parsed = removeNulls(JSON.parse(current.replace(/ /g, ",")).filter(function(value) { return !Number.isNaN(value); }));
            } else {
              parsed = [current];
            }

            if (!labels.includes(data[j]['time'])) {
              // new data for this time
              labels.push(data[j]['time']);
              paramData.data.push(parsed);
            }
            else {
              // merging data from for example one area with another
              var idx = labels.indexOf(data[j]['time']);
              paramData.data[idx] = paramData.data[idx].concat(parsed);
            }
          }
        }

        return filteredList;
      }


      function filterData(data) {
        filtered = preprocess(data);
        filtered = areaAggregate($("#areaAggregation").val(), filtered);
        filtered = timeAggregate($("#timeAggregation").val(), filtered);
        if ($('#parameterUnion').is(':checked') && $("#inputParameter1").val() !== undefined) filtered = parameterUnion(filtered);
        console.log(filtered)

        return filtered;
      }

      function getFilterForParam(param, str, lim) {
        if (str == "gt") return "gtfilter{" + lim + ";" + param + "}";
        if (str == "lt") return "ltfilter{" + lim + ";" + param + "}";
        if (str == "eq") return "eqfilter{" + lim + ";" + param + "}";
        if (str == "btw") {
          var lims = lim.split(","); 
          return "btwfilter{" + lims[0] + ";" + lims[1] + ";" + param + "}";
        }

        if (str == "none") return param;
      }

      function parameterUnion(data) {
        var ret = [];

        for (var k = 0; k < data.length; k++) {
 
          var labels = [];
          var y = [];

          // accept all time values (x-axis)
          for (var i = 0; i < data[k].y.length; i++) {
            y.push({label: data[k].y[i].label, data: []});
          }

          for (var i = 0; i < data[k].y[0].data.length; i++) {
            var vals=[];
            for (var j = 0; j < data[k].y.length; j++) {
              var arrd = data[k].y[j].data[i];
              if (Array.isArray(arrd) && arrd.length > 0) {
                vals.push(arrd);
              } else if (typeof arrd === 'number' && isFinite(arrd)) {
                vals.push(arrd);
              }
            }
            if (vals.length == data[k].y.length) {
              labels.push(data[k].x[i]);

              for (var j = 0; j < vals.length; j++) {
                y[j].data.push(vals[j]);
              }
            }
          }
          ret.push({ 'domain': data[k].domain, 'x': labels, 'y': y });
        }
        return ret
      }

      function getAreaAggregation(str) {
        if (str == "min") return function(data) { return Math.min.apply(Math, data.map(function(o) { return o == null ? +Infinity : o; })); };
        if (str == "max") return function(data) { return Math.max.apply(Math, data.map(function(o) { return o == null ? -Infinity : o; })); };
        if (str == "mean") return function(data) { return data.reduce(function(acc, val) { return acc + val; }, 0) / data.length; };
        if (str == "none") return function(data) { return data; };
      }

      function areaAggregate(str, data) {
        if (str == "none") return data;

         var op = getAreaAggregation(str);
        var ret = []
        for (var k = 0; k < data.length; k++) {
          var aggregated = { 'domain': data[k].domain, 'x': data[k].x, 'y': [] };

          for (var i = 0; i < data[k].y.length; i++) {
            var flt = {'label' : data[k].y[i].label, 'data': []}
            for (var j = 0; j < data[k].y[i].data.length; j++) {
              flt.data.push(op(data[k].y[i].data[j]));
            }
            aggregated.y.push(flt)
          }
          ret.push(aggregated);
       }
       return ret;
      }

      function timeAggregate(str, data) {
        if (str == "none") return data;

        var ret = []
        var timeRes = str.split(' ')[0];
        var aggOp = str.split(' ')[1];

        var date_trunc = function(str, dateval){
          if (str == 'daily') {
            return dateval.split('T')[0];
          }
          if (str == 'monthly') {
            return dateval.split('T')[0].substring(0,7);
          }
        }

        // loop over each parameter

        for (var k = 0; k < data.length; k++) {
          var labels = [];
          var y = [];

          for (var i = 0; i < data[k].y.length; i++) {
            y.push({label: data[k].y[i].label, data: []})

            var label = data[k].x[0];
            var curday = date_trunc(timeRes, data[k].x[0]);
            var dayvals = [];

            // loop over each data/time pair
            for (var j = 0; j < data[k].y[i].data.length; j++) {
              var day = date_trunc(timeRes, data[k].x[j]);
              var vals = data[k].y[i].data[j];

              if (day == curday) { 
                if (Array.isArray(vals)) {
                  for (var l = 0; l < vals.length; l++) {
                    if (dayvals.length < vals.length) {
                      for (var m = dayvals.length; m < vals.length; m++) {
                        dayvals.push([]);
                      }
                    }
                    dayvals[l].push(vals[l]);
                  }
                }
                else {
                  dayvals.push(vals); 
                }
              } else { 
                labels.push(label); 
                label = data[k].x[j]; 
                curday = day;
                aggs = [];
                if (Array.isArray(dayvals[0])) {
                  for (var l = 0; l < dayvals.length; l++) { 
                    aggs.push(getAreaAggregation(aggOp)(dayvals[l]));
                  }
                } else {
                  aggs = getAreaAggregation(aggOp)(dayvals);
                }
                y[i].data.push(aggs);
                dayvals = [];
              }
            }
/*
TODO
          for (var k = 0; k < dayvals.length; k++) { 
            aggs.push(getAreaAggregation(str)(dayvals[k]));
          }
         
          labels.push(label); // y[i].data.push([getAreaAggregation(str)(dayvals)]);
*/
          }
          ret.push({x : labels, y: y, domain: data[k].domain});

        }
        return ret;
      }

      function pad(n) {
        return n<10 ? '0' + n : n;
      }

      function updateChart(data){
        var ctx = document.getElementById("myChart");

        if (myChart != undefined) {
          myChart.destroy();
        }

        var color = function(i, alpha) {
          var colors = ['red','blue','orange','purple','maroon'];
          
          if (colors[i] == 'red') { return `rgba(32, 162, 219, ${alpha})`; }
          if (colors[i] == 'blue') { return `rgba(196, 93, 105, ${alpha})`; }
          if (colors[i] == 'orange') { return `rgba(255, 159, 64, ${alpha})`; }
          if (colors[i] == 'purple') { return `rgba(153, 102, 255, ${alpha})`; }
          if (colors[i] == 'maroon') { return `rgba(75, 192, 192, ${alpha})`; }

        };

        // sometimes boxplot y axis scaling is not optimal... some values are extending
        // outside the graph. calculate data range and feed it to chartjs to fix this 
        // issue.
        var realMin = 1000000;
        var realMax = -1000000;
        const minop = getAreaAggregation("min");
        const maxop = getAreaAggregation("max");

        for (var k = 0; k < data.length; k++) {
          for (var i = 0; i < data[k].y.length; i++) {
            for (var j = 0; j < data[k].y[i].data.length; j++) {
              var newMin = minop(data[k].y[i].data[j]);
              if (newMin < realMin) realMin = newMin;
              var newMax = maxop(data[k].y[i].data[j]);
              if (newMax > realMax) realMax = newMax;
            }
          }
        }

        myChart = new Chart(ctx, {
          data: {
            labels: data[0].x,
            datasets: function(data) {
              var sets = [];
               var ci = 0; // color index
              for (var k = 0; k < data.length; k++) {
                for (var i = 0; i < data[k].y.length; i++) {
//                  var multipleData = Array.isArray(data[k].y[0].data[0]) && data[k].y[0].data[0].length > 1;
                  var multipleData = (function(data) { 
                    var ret = false; // default single point data (line plot)
                    for (var i = 0; i < data.data.length; i++) {
                      if (data.data[i].length > 1) { ret = true; break; }
                    }
                    return ret;
                  })(data[k].y[i])
                  sets.push({
                    label: displayName(data[k].y[i].label + ", " + data[k].domain),
                    data: (data[k].y[i].data.length > 0 ? data[k].y[i].data : null),
                    lineTension: 0.3,
                    borderWidth: 2,
                    backgroundColor: function() { return (multipleData) ? color(ci, 0.1) : 'transparent'; }(),
                    pointBackgroundColor: color(ci, 1),
                    borderColor: color(ci, 1),
                    outlierColor: '#999999',
                    type: function() { return (multipleData) ? 'boxplot' : 'line'; }()
                  });
                  ci++;
                }
              }console.log(sets)
              return sets;
            }(data),
          },
          options: {
            spanGaps: true,
            scales: {
              xAxes: [{
                type: 'time',
                distribution: 'series'
              }],
              yAxes: [{
                ticks: {
                  beginAtZero: false,
                  suggestedMin: realMin,
                  suggestedMax: realMax
                }
              }]
            },
            legend: {
              display: true,
            }
          }
        });
      }

      var shortToLongName = function(name) {
        if (name == "TG-C") return "Ground Temperature";
        if (name == "FFG-MS") return "Wind Gust";
        if (name == "FF500-MS") return "Wind Speed 500m agl";
        if (name == "RRR-KGM2") return "Hourly Total Precipitation";
        if (name == "sum_t(RRR-KGM2/24h)") return "24 Hour Total Precipitation";
        if (name == "SNR-KGM2") return "Hourly Snow Fall";
        if (name == "sum_t(SNR-KGM2/24h)") return "24 Hour Snow Fall";
        if (name == "gtfilter") return ">";
        if (name == "ltfilter") return "<";
        if (name == "eqfilter") return "=";

        return name;
      };

      var displayName = function(prop){
        if (prop == "name" || prop == "time") return prop;
        if (prop.search("{") != -1) {
          var tokens = prop.split("{");
          var filter = shortToLongName(tokens[0]);
          tokens = tokens[1].split(";");
          var limit = tokens[0];
          var param = shortToLongName(tokens[1].replace('}', ''));
          return shortToLongName(param) + " " + filter + " " + limit;
        } else {
          return shortToLongName(prop);
        }
      };

      function store(data) {
        sessionStorage.clear();
        sessionStorage.setItem('data', JSON.stringify(data));
      };

      function updateTable(data, headers){
        $('#resultTable tbody tr').remove();
        $('#resultTable thead tr').remove();

        // update header

        var hdr = "<tr><th>#</th>";

        headers.forEach(prop => hdr += "<th>" + displayName(prop) + "</th>");

        hdr += "</tr>";
        if ($('#resultTable thead').length == 0) {
          $('#resultTable').append($('<thead/>'));
        }

        if ($('#resultTable th:last-child').length == 0) {
          $("#resultTable thead").append(hdr);
        }
        // update contents

        var clean = function(d) {
          return (d == -Infinity || d == Infinity) ? "" : d;
        }

        var start = $('resultTable').length

        for (var k = 0; k < data.length; k++) {
          for (var i = 0; i < data[k].y[0].data.length; i++) {
            var row = "<tr><td>" + (++start) + "</td><td>" + data[k].domain + "</td><td>" + data[k].x[i] + "</td>";

            for (var j = 0; j < data[k].y.length; j++) {
              row += "<td>" + clean(data[k].y[j].data[i]) + "</td>";
            }
            row += "</tr>";
            $('#resultTable tbody').append(row);
          }
        }
      }

      var bsAreas = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.obj.whitespace('value'),
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        prefetch: null, 
        remote: {
          url: "http://archive.nest.fmi.fi/autocomplete?keyword=ajax_fi_fi&max=10&pattern=%Q",
          wildcard: "%Q",
          transform: function(response){
            return response.autocomplete.result
              .filter(function (place) {
                return place.area == "";
              })
              .map(function (place){
                var name = place.name;
                return name;
            });
          }
        }
      });


      var maakunnat = [ 
        "Ahvenanmaa",
        "Etelä-Karjala",
        "Etelä-Pohjanmaa",
        "Etelä-Savo",
        "Kainuu",
        "Kanta-Häme",
        "Keski-Pohjanmaa",
        "Keski-Suomi",
        "Kymenlaakso",
        "Lappi",
        "Pirkanmaa",
        "Pohjanmaa",
        "Pohjois-Krajala",
        "Pohjois-Pohjanmaa",
        "Pohjois-Savo",
        "Päijät-Häme",
        "Satakunta", 
        "Uusimaa", 
        "Varsinais-Suomi"
      ];

      var mkAreas = new Bloodhound({
        datumTokenizer: Bloodhound.tokenizers.whitespace,
        queryTokenizer: Bloodhound.tokenizers.whitespace,
        local: maakunnat
      });
      mkAreas.initialize();

      function addBloodHound(element) {
        $(element).typeahead({
          hint: true,
          highlight: true,
          minLength: 1
        },
        {
          name: "bsAreas",
          source: bsAreas.ttAdapter()
        },
        {
          name: "maakunnat",
          source: mkAreas.ttAdapter()
        });
      }

      addBloodHound('#domain0');

      window.onload = function(){

        document.getElementById('addParameter').onclick = function()  {
          var last =  $('div[id^="inputParameter"]:last');
          if (last.length) {
            var next = parseInt(last.prop("id").match(/\d+/g), 10) + 1; 
            var clone = last.clone().prop('id', "inputParameter" + next + "Div");
            clone.children().each(function() {
              this.id = this.id.replace(next - 1, next);
            });
            clone.find("#inputParameter" + (next-1)).attr('id', 'inputParameter' + next);
            clone.find("#inputParameter" + (next-1) + 'Condition').attr('id', 'inputParameter' + next + 'Condition');
            clone.find("#inputParameter" + (next-1) + 'ConditionValue').attr('id', 'inputParameter' + next + 'ConditionValue');
            clone.find("#inputParameter" + (next) + "ConditionValue").val("");

            last.after(clone);
            $("#era").data("changed",true);
          }
        };

        document.getElementById('delParameter').onclick = function() {
          var last =  $('div[id^="inputParameter"]:last');

          if (parseInt(last.prop("id").match(/\d+/g), 10) > 0) { last.remove(); }
          $("#era").data("changed",true);

        };

        document.getElementById('addArea').onclick = function()  {
          var last =  $('div[id^="area"]:last');
          if (last.length) {
            var next = parseInt(last.prop("id").match(/\d+/g), 10) + 1; 
            var clone = last.clone().prop('id', "area" + next + "Div");
            clone.children().each(function() {
              this.id = this.id.replace(next - 1, next);
            });
            // rename elements
            clone.find("#domain" + (next-1)).attr('id', 'domain' + next);
            clone.find("#domain" + (next-1) + "Label").attr('id', 'domain' + next + "Label");
            // reset value and set default 'hint text'
            clone.find("#domain" + (next)).val("");
            clone.find("#domain" + (next)).typeahead('val', "Value of interest");
            clone.change(function() { $("#era").data("changed",true); })

            last.after(clone);
            $("#domain" + next + "Label").remove();
            $("#era").data("changed",true);
            addBloodHound('#domain' + next)
          }
        };

        document.getElementById('delArea').onclick = function() {
          var last =  $('div[id^="area"]:last');

          if (parseInt(last.prop("id").match(/\d+/g), 10) > 0) { last.remove(); }
          $("#era").data("changed",true);
        };
      }
