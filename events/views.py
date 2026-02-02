from django.http import JsonResponse
from django.contrib.auth.decorators import login_required

@login_required(login_url="/login/")
def events_list(request):
    return JsonResponse({"message": "Events list"})
