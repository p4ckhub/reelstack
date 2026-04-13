initTemplate(function (ctx) {
  var params = ctx.params,
    brandName = ctx.brandName;
  document.getElementById('footerName').textContent = brandName;

  var number = params.get('number');
  var title = params.get('title');
  var text = params.get('text');
  var color = params.get('color');

  if (number) document.getElementById('numText').textContent = number;
  if (title) document.getElementById('title').textContent = title;
  if (text) document.getElementById('description').textContent = text;
  else document.getElementById('description').style.display = 'none';

  if (color) {
    document.querySelector('.num-circle').style.background = color;
    document.querySelector('.footer').style.background = color;
  }

  autoSizeText(
    document.getElementById('title'),
    [
      [30, 5],
      [60, 4],
      [100, 3.2],
      [Infinity, 2.6],
    ],
    0.25
  );
});
