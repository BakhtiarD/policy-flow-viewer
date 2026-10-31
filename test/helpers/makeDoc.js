// Конструктор документа для тестов buildDiff.
// Не создаёт файлов на диске — buildDiff только читает поля в памяти
// и вызывает path.dirname(flowPath) для current.docName.

function makeDoc(opts) {
    const o = opts || {};
    const docName = o.docName || 'Other';
    return {
        flowPath: o.flowPath || ('/test/document/' + docName + '/documentFlow.json'),
        docName,
        flowName: o.flowName || (docName + 'Flow'),
        flow: o.flow || { states: [], transitions: [], actors: [], initialState: '' },
        config: o.config || { states: [], attachments: [] },
        csv: o.csv || { header: [], rows: [] }
    };
}

module.exports = { makeDoc };