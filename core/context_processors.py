from django.conf import settings


def google_maps_api_key(request):
    if request.user.is_authenticated:
        return {"GOOGLE_MAPS_API_KEY": getattr(settings, "GOOGLE_MAPS_API_KEY", "")}
    return {"GOOGLE_MAPS_API_KEY": ""}
