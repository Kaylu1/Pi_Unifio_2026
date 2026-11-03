// Only the original demo diagnostic is recognized when upgrading a legacy catalog.
// Price is deliberately excluded: the workshop owns its configured value.
export function isLegacyDemoEvaluation(service) {
    return service?.id === 5 && service.name === 'Diagnóstico eletrônico'
        && service.description === 'Leitura de falhas e diagnóstico com scanner.'
        && service.durationMinutes === 60
        && JSON.stringify(service.inspectionItems) === JSON.stringify(['Códigos de falha', 'Sensores', 'Teste de funcionamento']);
}
export function servicePurpose(service) {
    return service?.purpose ?? (isLegacyDemoEvaluation(service) ? 'avaliacao' : 'execucao');
}
export function migrateLocalServicePurposes(store) {
    for (const service of store.list('services')) {
        if (service.purpose == null && isLegacyDemoEvaluation(service))
            store.save('services', { ...service, purpose: 'avaliacao' });
    }
}
