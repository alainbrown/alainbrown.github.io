---
layout: default
description: "Software engineer building AI systems. Previously at Google and LinkedIn."
---

<h1 class="sr-only">Alain Brown — Software Engineer</h1>

<div class="section">
  <h2 class="section-title">Writing</h2>
  <ul class="post-list">
  {% assign visible_posts = site.posts | where_exp: "post", "post.archived != true" %}
  {% for post in visible_posts limit:5 %}
    <li>
      <a href="{{ post.url }}">
        <span class="title">{{ post.title }}</span>
        <span class="date">{{ post.date | date: "%B %Y" }}</span>
        {% if post.description %}<span class="excerpt">{{ post.description }}</span>{% endif %}
      </a>
    </li>
  {% endfor %}
  </ul>
</div>

<div class="section">
  <h2 class="section-title">Projects</h2>
  <div id="projects" class="projects">
    <noscript><p><a href="https://github.com/alainbrown">See my projects on GitHub →</a></p></noscript>
  </div>
</div>

<script>
(function () {
  var README = "https://raw.githubusercontent.com/alainbrown/alainbrown/main/README.md";
  var container = document.getElementById("projects");
  if (!container) return;

  fetch(README)
    .then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); })
    .then(function (md) { render(md.split(/\r?\n/)); })
    .catch(function () {
      container.innerHTML = '<p><a href="https://github.com/alainbrown">See my projects on GitHub →</a></p>';
    });

  function render(lines) {
    var bullet = /^[-*]\s*(\S.*?)?\s*\[\*\*(.+?)\*\*\]\((.+?)\)\s*:?\s*(.*)$/;
    var subhead = /^#{2,3}\s+(.+?)\s*$/;
    var html = "";
    var open = false;

    lines.forEach(function (line) {
      var m = line.match(bullet);
      if (m) {
        if (!open) { html += '<ul class="post-list">'; open = true; }
        var emoji = (m[1] || "").trim();
        html += '<li><a href="' + esc(m[3]) + '">'
          + '<span class="title">' + (emoji ? esc(emoji) + " " : "") + esc(m[2]) + "</span>"
          + (m[4] ? '<span class="excerpt">' + esc(m[4]) + "</span>" : "")
          + "</a></li>";
        return;
      }
      var s = line.match(subhead);
      if (s && !/^hi there/i.test(s[1])) {
        if (open) { html += "</ul>"; open = false; }
        html += '<h3 class="project-subhead">' + esc(s[1]) + "</h3>";
      }
    });
    if (open) html += "</ul>";
    container.innerHTML = html || '<p><a href="https://github.com/alainbrown">See my projects on GitHub →</a></p>';
  }

  function esc(s) {
    return s.replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
})();
</script>
