initTemplate(function (ctx) {
  var params = ctx.params,
    brandName = ctx.brandName;
  document.getElementById('footerName').textContent = brandName;

  var number = params.get('number');
  var duration = params.get('duration');
  var title = params.get('title');
  var text = params.get('text');
  var color = params.get('color');

  if (number) document.getElementById('numText').textContent = number;
  if (duration) document.getElementById('duration').textContent = duration;
  if (title) document.getElementById('title').textContent = title;
  if (text) document.getElementById('description').textContent = text;
  else document.getElementById('description').style.display = 'none';

  if (color) {
    document.querySelector('.num-circle').style.background = color;
    document.getElementById('accentBar').style.background = color;
  }

  autoSizeText(
    document.getElementById('title'),
    [
      [25, 5.5],
      [50, 4.5],
      [80, 3.5],
      [Infinity, 2.8],
    ],
    0.3
  );
});
