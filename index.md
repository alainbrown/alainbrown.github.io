---
layout: default
description: "Software engineer building AI systems. Previously at Google and LinkedIn."
---

<div class="section">
  <h2 class="section-title">Writing</h2>
  <ul class="post-list">
  {% for post in site.posts limit:5 %}
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
  <div class="project-grid">
    <a href="https://github.com/alainbrown/musicprint">
      <img src="https://opengraph.githubassets.com/1/alainbrown/musicprint" alt="musicprint" loading="lazy" />
    </a>
    <a href="https://github.com/alainbrown/stack-agent">
      <img src="https://opengraph.githubassets.com/1/alainbrown/stack-agent" alt="stack-agent" loading="lazy" />
    </a>
    <a href="https://github.com/containerfy/containerfy">
      <img src="https://opengraph.githubassets.com/1/containerfy/containerfy" alt="containerfy" loading="lazy" />
    </a>
  </div>
</div>
