from __future__ import annotations

import json
import re
from dataclasses import dataclass
from html.parser import HTMLParser
from typing import Any
from urllib.parse import urlparse

import httpx

PRODUCT_ID = re.compile(r"^[1-9][0-9]*$")


@dataclass(frozen=True)
class BoothProduct:
    id: str
    title: str
    price: str
    url: str
    category: str
    thumbnails: tuple[str, ...]
    shop_id: str
    shop_name: str
    shop_url: str
    shop_avatar: str


class ProductPageParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.json_ld: list[str] = []
        self.meta: dict[str, str] = {}
        self.category = ""
        self.shop_avatar = ""
        self._json_ld_data: list[str] | None = None

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = {key: value or "" for key, value in attrs}
        if tag == "script" and values.get("type") == "application/ld+json":
            self._json_ld_data = []
        if tag == "meta":
            key = values.get("property") or values.get("name")
            if key and values.get("content"):
                self.meta[key] = values["content"]
        if not self.category and values.get("data-shop-tracking-product-category"):
            self.category = values["data-shop-tracking-product-category"]
        if tag == "img" and not self.shop_avatar and values.get("alt") and values.get("src"):
            self.shop_avatar = values["src"]

    def handle_data(self, data: str) -> None:
        if self._json_ld_data is not None:
            self._json_ld_data.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag == "script" and self._json_ld_data is not None:
            self.json_ld.append("".join(self._json_ld_data))
            self._json_ld_data = None


def _product_schema(documents: list[str]) -> dict[str, Any] | None:
    for document in documents:
        try:
            value = json.loads(document)
        except json.JSONDecodeError:
            continue
        candidates = value if isinstance(value, list) else [value]
        for candidate in candidates:
            if isinstance(candidate, dict) and candidate.get("@type") == "Product":
                return candidate
    return None


def parse_product_page(product_id: str, html: str) -> BoothProduct | None:
    parser = ProductPageParser()
    parser.feed(html)
    schema = _product_schema(parser.json_ld)
    if schema is None:
        return None

    brand = schema.get("brand")
    brand = brand if isinstance(brand, dict) else {}
    shop_url = str(brand.get("url") or "").strip()
    shop_name = str(brand.get("name") or "").strip()
    title = str(schema.get("name") or "").strip()
    if not shop_url or not shop_name or not title:
        return None

    shop_host = (urlparse(shop_url).hostname or "").lower()
    if not shop_host.endswith(".booth.pm"):
        return None
    shop_id = shop_host.removesuffix(".booth.pm")
    if not shop_id or "." in shop_id:
        return None

    offers = schema.get("offers")
    offers = offers if isinstance(offers, dict) else {}
    image = schema.get("image") or parser.meta.get("og:image", "")
    thumbnails = (str(image).strip(),) if image else ()
    product_url = parser.meta.get("og:url") or f"https://booth.pm/ja/items/{product_id}"
    return BoothProduct(
        id=product_id,
        title=title,
        price=str(offers.get("price") or ""),
        url=product_url,
        category=parser.category,
        thumbnails=thumbnails,
        shop_id=shop_id,
        shop_name=shop_name,
        shop_url=shop_url,
        shop_avatar=parser.shop_avatar,
    )


async def fetch_product(product_id: str) -> BoothProduct | None:
    if not PRODUCT_ID.fullmatch(product_id):
        return None
    async with httpx.AsyncClient(
        follow_redirects=True,
        timeout=10,
        headers={"User-Agent": "BoothPlus/0.1 (+https://booth-plus.ribe.moe)"},
    ) as client:
        response = await client.get(f"https://booth.pm/ja/items/{product_id}")
    if response.status_code == 404:
        return None
    response.raise_for_status()
    return parse_product_page(product_id, response.text)
