'use strict';

function renderChart(full, filtered){
  const list = (filtered && filtered.length) ? filtered : full;
  const labels = list.map(t=>t.date);
  const points = list.map(t=>t.balanceAfter);
  const base   = list.length ? list[0].balanceBefore : (parseFloat(capitalConfig.defaultInitial)||0);
  const ctx = document.getElementById('equityChart').getContext('2d');
  if(equityChart) equityChart.destroy();
  equityChart = new Chart(ctx,{
    type:'line',
    data:{
      labels: labels.length?['Início',...labels]:['Início'],
      datasets:[{
        data: points.length?[base,...points]:[base],
        borderColor:'#7B6CFF', backgroundColor:'rgba(123,108,255,.10)',
        fill:true, tension:.25, pointRadius:2, borderWidth:2,
        pointBackgroundColor:'#35D6FF'
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{legend:{display:false}},
      scales:{
        x:{ticks:{color:'#7E88A8',font:{size:10}}, grid:{color:'#232B48'}},
        y:{ticks:{color:'#7E88A8',font:{size:10}, callback:v=>fmtMoney(v)}, grid:{color:'#232B48'}}
      }
    }
  });
}
