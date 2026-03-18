---
layout: default
description: "Software engineer building AI systems. Previously at Google and LinkedIn."
---

<h1 class="sr-only">Alain Brown — Software Engineer</h1>

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
      <img src="https://opengraph.githubassets.com/1/alainbrown/musicprint" alt="MusicPrint — offline song identification using compressed audio embeddings" loading="lazy" />
    </a>
    <a href="https://github.com/alainbrown/stack-agent">
      <img src="https://opengraph.githubassets.com/1/alainbrown/stack-agent" alt="stack-agent — AI-powered CLI for scaffolding full-stack applications" loading="lazy" />
    </a>
    <a href="https://github.com/containerfy/containerfy">
      <img src="https://opengraph.githubassets.com/1/containerfy/containerfy" alt="containerfy — automatically containerize applications" loading="lazy" />
    </a>
  </div>
</div>
