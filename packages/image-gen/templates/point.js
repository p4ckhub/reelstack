initTemplate(function (ctx) {
  var params = ctx.params,
    brandName = ctx.brandName;
  document.getElementById('footerName').textContent = brandName;

  var number = params.get('number');
  var title = params.get('title');
  var titleHighlight = params.get('titleHighlight');
  var text = params.get('text');
  var color = params.get('color');
  var num = params.get('num');
  var badge = params.get('badge');

  if (number) {
    document.getElementById('numText').textContent = number;
  } else {
    // No semantic step number — hide the circle entirely so the slide reads
    // as "headline + body" rather than "list item N".
    document.querySelector('.num-circle').style.display = 'none';
  }

  if (num) document.getElementById('seriesNum').textContent = '#' + num;

  var badgeEl = document.getElementById('badge');
  if (badge) {
    badgeEl.textContent = badge;
  } else {
    badgeEl.style.display = 'none';
  }

  if (title) {
    var titleEl = document.getElementById('title');
    if (titleHighlight && title.indexOf(titleHighlight) !== -1) {
      var idx = title.indexOf(titleHighlight);
      var before = title.slice(0, idx);
      var after = title.slice(idx + titleHighlight.length);
      titleEl.textContent = '';
      if (before) titleEl.appendChild(document.createTextNode(before));
      var span = document.createElement('span');
      span.className = 'title-highlight';
      span.textContent = titleHighlight;
      titleEl.appendChild(span);
      if (after) titleEl.appendChild(document.createTextNode(after));
    } else {
      titleEl.textContent = title;
    }
  }

  if (text) document.getElementById('description').textContent = text;
  else document.getElementById('description').style.display = 'none';

  if (color) {
    document.querySelector('.num-circle').style.background = color;
    document.querySelector('.footer').style.background = color;
  }

  autoSizeText(
    document.getElementById('title'),
    [
      [30, 6],
      [60, 4.6],
      [100, 3.6],
      [Infinity, 3],
    ],
    0.3
  );
});
