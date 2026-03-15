initTemplate(function (ctx) {
  var params = ctx.params;

  var days = params.get('days');
  var label = params.get('label');
  var heading = params.get('heading');
  var date = params.get('date');
  var speaker = params.get('speaker');
  var price1 = params.get('price1');
  var price2 = params.get('price2');
  var deadline = params.get('deadline');
  var logo = params.get('logo');

  if (days) document.getElementById('countdownNum').textContent = days;
  if (label) document.getElementById('countdownLabel').textContent = label;
  if (heading) document.getElementById('heading').textContent = heading;
  if (date) document.getElementById('date').textContent = date;
  if (speaker) document.getElementById('speaker').textContent = speaker;
  if (price1) document.getElementById('price1').textContent = price1;
  if (price2) document.getElementById('price2').textContent = price2;
  if (deadline) document.getElementById('deadline').textContent = deadline;

  if (logo) {
    var el = document.getElementById('logo');
    el.src = 'file://' + logo;
    el.style.display = 'block';
  }
});
