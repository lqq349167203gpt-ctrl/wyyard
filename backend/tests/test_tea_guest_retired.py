def test_tea_guest_api_routes_are_not_registered():
    from app.main import app

    assert not any(route.path.startswith("/api/tea-guest/") for route in app.routes)
