---
layout: default
title: Blog
---

<h1 class="page-title">Writing</h1>

<div class="section">
  <ul class="post-list">
  {% for post in site.posts %}
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
