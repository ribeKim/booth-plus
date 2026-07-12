from booth_plus.booth import parse_product_page


def test_parse_product_page() -> None:
    html = """
    <html><head>
      <meta property="og:url" content="https://booth.pm/ja/items/5058077">
      <script type="application/ld+json">
        {"@type":"Product","name":"Manuka","offers":{"price":"6000"},
         "brand":{"@type":"Brand","name":"STUDIO JINGO","url":"https://jingo1016.booth.pm/"},
         "image":"https://example.com/product.jpg"}
      </script>
    </head><body data-shop-tracking-product-category="3D Characters">
      <img alt="STUDIO JINGO" src="https://example.com/avatar.jpg">
    </body></html>
    """

    product = parse_product_page("5058077", html)

    assert product is not None
    assert product.id == "5058077"
    assert product.title == "Manuka"
    assert product.price == "6000"
    assert product.shop_id == "jingo1016"
    assert product.shop_name == "STUDIO JINGO"
    assert product.category == "3D Characters"
    assert product.thumbnails == ("https://example.com/product.jpg",)


def test_parse_product_page_rejects_non_booth_shop() -> None:
    html = """
    <script type="application/ld+json">
      {"@type":"Product","name":"Bad","brand":{"name":"Bad","url":"https://example.com/"}}
    </script>
    """
    assert parse_product_page("1", html) is None
